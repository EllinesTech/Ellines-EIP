/**
 * Pages Function: GET /api/v1/orgs/me/group-summary
 * Owner: combined health summary of the current org plus every child org
 * linked directly under it — a group view, not just one business at a time.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import { readAuthoritativeSourceCounts } from '../../../../shared/source-counts';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (auth.role !== 'owner') {
    return json(
      { statusCode: 403, message: 'Only the Organization Owner can view the group summary' },
      403,
    );
  }

  const supabase = getAdminClient(context.env);

  const [{ data: current, error: currentErr }, { data: children, error: childrenErr }] =
    await Promise.all([
      supabase.from('organizations').select('id, name, slug').eq('id', auth.organizationId).maybeSingle(),
      supabase.from('organizations').select('id, name, slug').eq('parent_org_id', auth.organizationId),
    ]);

  if (currentErr) return json({ statusCode: 500, message: currentErr.message }, 500);
  if (childrenErr) return json({ statusCode: 500, message: childrenErr.message }, 500);
  if (!current) return json({ statusCode: 404, message: 'Organization not found' }, 404);

  const group = [current, ...(children || [])];
  const groupIds = group.map((o) => o.id as string);

  const { data: snapshots, error: snapErr } = await supabase
    .from('enterprise_snapshots')
    .select('organization_id, health_score, connected_systems, open_alerts, open_decisions, brief_highlight, synced_at')
    .in('organization_id', groupIds);
  if (snapErr) return json({ statusCode: 500, message: snapErr.message }, 500);

  const snapByOrg = new Map((snapshots || []).map((s) => [s.organization_id as string, s]));

  // The "Systems" column is a per-business count, so each organisation in the
  // group is counted from ITS OWN persisted source classification. Reading the
  // snapshot's `connected_systems` here would show a connector count, so a
  // website-only business with one API connector read as "1 connected system".
  const countsByOrg = new Map(
    await Promise.all(
      group.map(async (org) => [org.id as string, await readAuthoritativeSourceCounts(supabase, org.id as string)] as const),
    ),
  );

  return json(
    group.map((org) => {
      const snap = snapByOrg.get(org.id as string);
      const counts = countsByOrg.get(org.id as string);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        isCurrent: org.id === auth.organizationId,
        isChild: org.id !== current.id,
        healthScore: snap?.health_score ?? null,
        // Authoritative: BUSINESS_SYSTEM source rows only. 0 is a real answer.
        connectedSystems: counts?.businessSystems ?? 0,
        websites: counts?.websites ?? 0,
        connectors: counts?.connectors ?? 0,
        openAlerts: snap?.open_alerts ?? null,
        openDecisions: snap?.open_decisions ?? null,
        briefHighlight: snap?.brief_highlight ?? null,
        syncedAt: snap?.synced_at ?? null,
      };
    }),
  );
};
