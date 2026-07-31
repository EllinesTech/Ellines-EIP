import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../shared/auth';
import { isSyncDue, type InstallConfig } from '../../../shared/connectors';

/**
 * Run automatic syncs that are due for the caller's organization.
 * Invoked from the Connectors UI on load, and by cron with a forwarded admin token.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const supabase = getAdminClient(context.env);
  const { data: rows, error } = await supabase
    .from('connector_installations')
    .select('id, config, display_name, catalog_id')
    .eq('organization_id', auth.organizationId);

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const due = (rows || []).filter((row) =>
    isSyncDue((row.config || {}) as InstallConfig),
  );

  const results: { id: string; name: string; ok: boolean; message: string }[] = [];
  const origin = new URL(context.request.url).origin;
  const authHeader = context.request.headers.get('Authorization') || '';

  for (const row of due.slice(0, 8)) {
    try {
      const res = await fetch(
        `${origin}/api/v1/connectors/installations/${row.id as string}/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: '{}',
        },
      );
      const body = (await res.json().catch(() => ({}))) as { message?: string; healthScore?: number };
      results.push({
        id: row.id as string,
        name: (row.display_name as string) || (row.catalog_id as string),
        ok: res.ok,
        message: res.ok
          ? `Synced (health ${body.healthScore ?? '—'})`
          : body.message || `HTTP ${res.status}`,
      });
    } catch (err) {
      results.push({
        id: row.id as string,
        name: (row.display_name as string) || (row.catalog_id as string),
        ok: false,
        message: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  }

  return json({
    checked: (rows || []).length,
    due: due.length,
    ran: results.length,
    results,
  });
};
