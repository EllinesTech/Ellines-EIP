/**
 * Dev Pages API: POST /api/v1/connectors/run-due
 * Pages Router API routes are IGNORED during static export builds.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, getDevSupabase, requireDevAuth, isOrgAdmin } from '../_dev-auth';

type InstallConfig = { syncIntervalMinutes?: number; lastSyncedAt?: string | null };

function isSyncDue(config: InstallConfig): boolean {
  const interval = config.syncIntervalMinutes ?? 15;
  if (!config.lastSyncedAt) return true;
  return Date.now() - new Date(config.lastSyncedAt).getTime() >= interval * 60 * 1000;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }
  if (req.method !== 'POST') { devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;
  if (!isOrgAdmin(auth.role)) { devJson(res, { statusCode: 403, message: 'Admins only' }, 403); return; }

  const supabase = getDevSupabase();
  const { data: rows, error } = await supabase.from('connector_installations').select('id, config, display_name, catalog_id').eq('organization_id', auth.organizationId);
  if (error) { devJson(res, { statusCode: 500, message: error.message }, 500); return; }

  const due = (rows || []).filter((row) => isSyncDue((row.config || {}) as InstallConfig));
  const results: { id: string; name: string; ok: boolean; message: string }[] = [];
  const authHeader = req.headers['authorization'] || '';

  for (const row of due.slice(0, 8)) {
    try {
      const syncRes = await fetch(`http://localhost:3001/api/v1/connectors/installations/${row.id as string}/sync`, {
        method: 'POST', headers: { Authorization: authHeader as string, 'Content-Type': 'application/json' }, body: '{}',
      });
      const body = (await syncRes.json().catch(() => ({}))) as { message?: string; healthScore?: number };
      results.push({ id: row.id as string, name: (row.display_name as string) || (row.catalog_id as string), ok: syncRes.ok, message: syncRes.ok ? `Synced (health ${body.healthScore ?? '—'})` : body.message || `HTTP ${syncRes.status}` });
    } catch (err) {
      results.push({ id: row.id as string, name: (row.display_name as string) || (row.catalog_id as string), ok: false, message: err instanceof Error ? err.message : 'Sync failed' });
    }
  }

  devJson(res, { checked: (rows || []).length, due: due.length, ran: results.length, results });
}
