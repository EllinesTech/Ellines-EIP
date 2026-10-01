/**
 * PATCH /api/v1/orgs/me/sources/{id} — classify one of the organisation's sources.
 *
 * WHY THIS EXISTS
 * ---------------
 * "It speaks REST" is not a source category. A company's public catalogue API and
 * its ERP API are both REST endpoints, but one belongs under Connected Website and
 * the other under Connected Systems — and only the organisation knows which. So
 * classification is persisted configuration (`sourceType` + `sourceKind`), set here
 * explicitly, and never inferred from a catalog id, a URL path or a response shape.
 *
 * What it does NOT do:
 *   - copy or move capability data: registries stay attached to this same source row,
 *     so reclassifying moves the capabilities WITH the source instead of copying;
 *   - invent a URL: a WEBSITE source must carry the URL it will actually be
 *     measured against;
 *   - infer anything about other organisations: the row must belong to the caller's
 *     org (or to the org a platform admin explicitly targets).
 *
 * Sequence: authenticate → authorize → require a reason → mutate transactionally →
 * audit → answer with the persisted row. A refused mutation is audited too.
 */
import {
  auditRow,
  getAdminClient,
  getClientIp,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

const SOURCE_TYPES = ['WEBSITE', 'BUSINESS_SYSTEM'] as const;
const SOURCE_KINDS = ['HTML', 'API'] as const;

type SourceType = (typeof SOURCE_TYPES)[number];
type SourceKind = (typeof SOURCE_KINDS)[number];

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Map the database's guarded errors onto honest HTTP statuses. */
function classify(errorMessage: string): { status: number; code: string } {
  const m = String(errorMessage || '');
  if (m.includes('eip_source_not_found')) return { status: 404, code: 'not_found' };
  if (m.includes('eip_website_url_required')) return { status: 400, code: 'website_url_required' };
  if (m.includes('eip_kind_requires_website')) return { status: 400, code: 'kind_requires_website' };
  if (m.includes('eip_invalid_source_type') || m.includes('eip_invalid_source_kind')) {
    return { status: 400, code: 'invalid_classification' };
  }
  if (m.includes('eip_reason_required')) return { status: 400, code: 'reason_required' };
  if (m.includes('eip_name_too_long')) return { status: 400, code: 'name_too_long' };
  // One WEBSITE per organisation is a partial unique index, so Postgres reports a
  // second one as a unique violation rather than a friendly message.
  if (m.includes('organization_sources_org_website_key') || m.includes('duplicate key')) {
    return { status: 409, code: 'website_already_configured' };
  }
  return { status: 500, code: 'classification_failed' };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'PATCH') return json({ message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Tenant-side classification is an owner/IT-admin decision about their own
  // organisation; a platform operator may act on one org explicitly via ?orgId=.
  let organizationId = auth.organizationId;
  const isPlatformAdmin = platformAdminFromEnv(context.env, auth.email);
  if (isPlatformAdmin) {
    const requested = new URL(context.request.url).searchParams.get('orgId');
    if (requested) organizationId = requested;
  } else {
    // requireOrgAdmin returns a Response to send when the role is not allowed, or
    // null when it is. Reading it as a boolean would invert the check.
    const denied = requireOrgAdmin(auth.role);
    if (denied) return denied;
  }

  const supabase = getAdminClient(context.env);
  const rawId = context.params?.id;
  const id = (Array.isArray(rawId) ? rawId[0] : rawId) ?? '';
  if (!id) return json({ statusCode: 400, message: 'id is required' }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ statusCode: 400, message: 'Invalid request body' }, 400);
  }

  const sourceType = str(body.sourceType) as SourceType;
  const sourceKindRaw = str(body.sourceKind);
  const sourceKind = (sourceKindRaw ? sourceKindRaw : null) as SourceKind | null;
  const websiteUrl = str(body.websiteUrl);
  // Optional: the source's own display name. Empty/absent keeps the stored name, so
  // classifying a source never silently renames it.
  const name = str(body.name);
  const reason = str(body.reason);

  // Validation before any write, so the caller gets a precise 400 instead of a
  // database exception. The database re-checks all of it inside the transaction.
  if (!SOURCE_TYPES.includes(sourceType)) {
    return json(
      { statusCode: 400, message: `sourceType must be one of ${SOURCE_TYPES.join(', ')}` },
      400,
    );
  }
  if (sourceKind && !SOURCE_KINDS.includes(sourceKind)) {
    return json(
      { statusCode: 400, message: `sourceKind must be one of ${SOURCE_KINDS.join(', ')}` },
      400,
    );
  }
  if (sourceType === 'BUSINESS_SYSTEM' && sourceKind) {
    return json(
      { statusCode: 400, message: 'A business system has no website kind — sourceKind applies to WEBSITE only' },
      400,
    );
  }
  if (sourceType === 'WEBSITE' && !websiteUrl) {
    return json(
      { statusCode: 400, message: 'A website source needs the URL it will be measured against' },
      400,
    );
  }
  if (name.length > 160) {
    return json({ statusCode: 400, message: 'name must be 160 characters or fewer' }, 400);
  }
  // Reason first: classification changes where a client's data appears, so it is
  // always attributable.
  if (!reason) {
    return json(
      { statusCode: 400, message: 'A reason is required to change how a source is classified' },
      400,
    );
  }

  // Tenant boundary: the source must belong to the organisation being acted on.
  const { data: existing, error: lookupError } = await supabase
    .from('organization_sources')
    .select('id, organization_id, source_type, source_kind, name, website_url')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) return json({ statusCode: 500, message: lookupError.message }, 500);
  if (!existing) return json({ statusCode: 404, message: 'Source not found' }, 404);
  if (existing.organization_id !== organizationId) {
    return json({ statusCode: 404, message: 'Source not found' }, 404);
  }

  const before = {
    sourceType: existing.source_type,
    sourceKind: existing.source_kind,
    websiteUrl: existing.website_url,
  };

  const { data, error } = await supabase.rpc('eip_classify_source', {
    p_source_id: id,
    p_source_type: sourceType,
    p_source_kind: sourceKind,
    p_website_url: websiteUrl,
    p_name: name,
    p_reason: reason,
    p_actor_email: auth.email,
  });

  const correlationId = crypto.randomUUID();

  if (error) {
    const mapped = classify(error.message);
    await getAdminClient(context.env).from('audit_logs').insert(auditRow({
      organizationId,
      userId: auth.sub,
      action: 'org.source.classify',
      resource: 'organization_source',
      metadata: {
        correlationId,
        reason,
        sourceId: id,
        requested: { sourceType, sourceKind, websiteUrl: websiteUrl || null },
        result: 'failure',
        error: mapped.code,
      },
      ip: getClientIp(context.request),
    }));
    return json(
      { statusCode: mapped.status, message: 'Unable to classify source', error: mapped.code },
      mapped.status,
    );
  }

  // A mutating function that returns nothing is not a success.
  if (!data) {
    await getAdminClient(context.env).from('audit_logs').insert(auditRow({
      organizationId,
      userId: auth.sub,
      action: 'org.source.classify',
      resource: 'organization_source',
      metadata: { correlationId, reason, sourceId: id, result: 'failure', error: 'empty_result' },
      ip: getClientIp(context.request),
    }));
    return json({ statusCode: 500, message: 'Classification returned no persisted state' }, 500);
  }

  const persisted = data as {
    id: string;
    sourceType: string;
    sourceKind: string | null;
    name: string;
    websiteUrl: string | null;
  };

  await getAdminClient(context.env).from('audit_logs').insert(auditRow({
    organizationId,
    userId: auth.sub,
    action: 'org.source.classify',
    resource: 'organization_source',
    metadata: {
      correlationId,
      reason,
      sourceId: id,
      before,
      after: {
        sourceType: persisted.sourceType,
        sourceKind: persisted.sourceKind,
        websiteUrl: persisted.websiteUrl,
      },
      result: 'success',
    },
    ip: getClientIp(context.request),
  }));

  return json({ statusCode: 200, data: persisted });
};
