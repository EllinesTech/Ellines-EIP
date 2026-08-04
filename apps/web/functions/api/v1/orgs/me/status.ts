/**
 * GET /api/v1/orgs/me/status
 *
 * Returns a quick org health summary — connector count, last sync,
 * member count, pending invites. Used by Settings email provider
 * badge and the onboarding checklist.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const orgId = auth.organizationId;

  // Run queries in parallel
  const [installRes, usersRes, snapshotRes, orgRes] = await Promise.all([
    supabase
      .from('connector_installations')
      .select('id, status, last_synced_at')
      .eq('organization_id', orgId),
    supabase
      .from('users')
      .select('id, is_active')
      .eq('organization_id', orgId)
      .eq('is_active', true),
    supabase
      .from('enterprise_snapshots')
      .select('health_score, synced_at')
      .eq('organization_id', orgId)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle(),
  ]);

  const installations = installRes.data || [];
  const members = usersRes.data || [];
  const snapshot = snapshotRes.data;

  // Count pending invites from org settings
  const orgSettings =
    orgRes.data?.settings &&
    typeof orgRes.data.settings === 'object' &&
    !Array.isArray(orgRes.data.settings)
      ? (orgRes.data.settings as Record<string, unknown>)
      : {};

  const pendingKey = `eip_pending_invites_${orgId}`;
  const rawInvites = orgSettings[pendingKey];
  const pendingInvites = Array.isArray(rawInvites)
    ? rawInvites.filter(
        (i) =>
          i &&
          typeof i === 'object' &&
          typeof (i as Record<string, unknown>).expiresAt === 'string' &&
          new Date((i as Record<string, unknown>).expiresAt as string) > new Date(),
      )
    : [];

  const activeInstallations = installations.filter(
    (i) => i.status === 'active' || i.status === 'synced',
  );

  // Most recent sync across all connectors
  const syncTimes = installations
    .map((i) => i.last_synced_at as string | null)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastSyncedAt = syncTimes[0] ?? snapshot?.synced_at ?? null;

  return json({
    connectorCount: installations.length,
    activeConnectorCount: activeInstallations.length,
    lastSyncedAt,
    memberCount: members.length,
    pendingInviteCount: pendingInvites.length,
    hasSync: Boolean(lastSyncedAt),
    healthScore: snapshot ? (snapshot.health_score as number | null) : null,
  });
};
