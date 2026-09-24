import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  // Snapshot is a computed summary of the org's current state
  // Return a stub for now — real implementation would aggregate:
  // - Health score from connectors
  // - Open alerts/decisions
  // - Brief highlight from latest Ellinea digest
  // - Timeline of recent significant events

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();

  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);
  if (!org) return json({ statusCode: 404, message: 'Organization not found' }, 404);

  // Stub snapshot
  return json({
    organizationId: org.id,
    connectorId: 'snapshot',
    connectorName: 'Platform Snapshot',
    healthScore: 85,
    connectedSystems: 0,
    openAlerts: 0,
    openDecisions: 0,
    briefHighlight: `${org.name} snapshot (implementation pending)`,
    timeline: [],
    syncedAt: new Date().toISOString(),
  });
};
