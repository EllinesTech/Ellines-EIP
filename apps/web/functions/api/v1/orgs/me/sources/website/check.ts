/**
 * POST /api/v1/orgs/me/sources/website/check
 *
 * Runs a REAL probe against the organisation's configured website and persists
 * the measurement. There is no synthetic path: every field written here comes
 * from an actual request, and any measurement that could not be taken is stored
 * as NULL rather than as 0.
 *
 * The probe covers layer 1 of the website engine only (reachability, HTTP,
 * latency, TLS). It deliberately does NOT probe business endpoints: "the site is
 * online" and "the site provides orders" are different facts, and conflating
 * them is how a reachable homepage comes to imply capabilities that were never
 * discovered.
 *
 * If the organisation has not configured a website this returns 409 with an
 * explicit not-connected state. It never probes a substitute URL.
 */
import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../../shared/auth';
import { isSafeEgressTarget, safeFetch, SsrfError } from '../../../../../../shared/egress';
import { probeWebsite, type WebsiteProbeOutcome } from '@ellines-eip/shared';

/** Map a real transport failure onto the outcome vocabulary. */
function classify(err: unknown): { outcome: WebsiteProbeOutcome; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code ?? '';
  const m = raw.toLowerCase();
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || m.includes('getaddrinfo') || m.includes('dns')) {
    return { outcome: 'DNS_FAILURE', message: `DNS lookup failed: ${raw}` };
  }
  if (
    m.includes('certificate') ||
    m.includes('ssl') ||
    m.includes('tls') ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
  ) {
    return { outcome: 'TLS_FAILURE', message: `TLS negotiation failed: ${raw}` };
  }
  if (m.includes('timeout') || m.includes('timed out') || (err as { name?: string })?.name === 'AbortError') {
    return { outcome: 'TIMEOUT', message: `The request timed out: ${raw}` };
  }
  return { outcome: 'OFFLINE', message: `Could not reach the site: ${raw}` };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  let organizationId = auth.organizationId;
  if (platformAdminFromEnv(context.env, auth.email)) {
    const requested = new URL(context.request.url).searchParams.get('orgId');
    if (requested) organizationId = requested;
  }

  const { data: source } = await supabase
    .from('organization_sources')
    .select('id, name, website_url')
    .eq('organization_id', organizationId)
    .eq('source_type', 'WEBSITE')
    .maybeSingle();

  // No configured website is a real, reportable state - not an error to paper over.
  if (!source?.website_url) {
    return json(
      {
        statusCode: 409,
        state: 'NOT_CONNECTED',
        message:
          'No website is configured for this organisation, so there is nothing to check. EIP does not substitute a different site.',
      },
      409,
    );
  }

  const url = source.website_url as string;
  const check = isSafeEgressTarget(url);
  if (!check.safe) {
    return json(
      { statusCode: 400, state: 'BLOCKED', message: check.reason ?? 'Blocked by egress policy' },
      400,
    );
  }

  // probeWebsite performs the real request and measures it. It returns NOT_CHECKED
  // rather than a fabricated ONLINE when it cannot run.
  const report = await probeWebsite(url, {
    fetchImpl: (input, init) => safeFetch(input as string, init as RequestInit),
  });

  // `tls.valid` is null when TLS was not measurable (plain HTTP, or the probe
  // failed). It stays null in the database rather than becoming false or 0.
  const row = {
    id: crypto.randomUUID(),
    source_id: source.id as string,
    organization_id: organizationId,
    checked_at: report.checkedAt,
    outcome: report.outcome,
    http_status: report.httpStatus,
    response_time_ms: report.responseTimeMs === null ? null : Math.round(report.responseTimeMs),
    redirected: report.redirected,
    final_url: report.finalUrl,
    tls_valid: report.tls.valid,
    tls_issuer: report.tls.issuer,
    tls_subject: report.tls.subject,
    tls_valid_to: report.tls.validTo,
    message: report.message?.slice(0, 500) ?? null,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('source_website_measurements').insert(row);
  // A failed write must not be swallowed: the caller would otherwise be shown a
  // live measurement that no subsequent page load could reproduce.
  if (error) {
    return json(
      { statusCode: 500, message: `measurement write failed: ${error.message}` },
      500,
    );
  }

  return json({
    state: 'CHECKED',
    sourceId: row.source_id,
    url,
    outcome: row.outcome,
    httpStatus: row.http_status,
    responseTimeMs: row.response_time_ms,
    redirected: row.redirected,
    finalUrl: row.final_url,
    tls: {
      valid: row.tls_valid,
      issuer: row.tls_issuer,
      subject: row.tls_subject,
      validTo: row.tls_valid_to,
    },
    checkedAt: row.checked_at,
    message: row.message,
  });
};
