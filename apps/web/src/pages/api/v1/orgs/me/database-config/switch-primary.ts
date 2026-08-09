/**
 * Dev Pages API: POST /api/v1/orgs/me/database-config/switch-primary
 * Pages Router API routes are IGNORED during static export builds.
 * This only runs locally — production uses the real Cloudflare Pages Function.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, getDevSupabase, requireDevAuth, isOrgAdmin } from '../../../../../../lib/dev-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }
  if (req.method !== 'POST') { devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;
  if (!isOrgAdmin(auth.role)) { devJson(res, { statusCode: 403, message: 'Admins only' }, 403); return; }

  const { configId, reason } = req.body || {};
  if (!configId) { devJson(res, { statusCode: 400, message: 'configId is required' }, 400); return; }

  const supabase = getDevSupabase();

  // Verify config belongs to this org
  const { data: config, error: configErr } = await supabase
    .from('database_configurations')
    .select('id, name, type')
    .eq('id', configId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (configErr || !config) {
    devJson(res, { statusCode: 404, message: 'Database configuration not found' }, 404);
    return;
  }

  // Find current primary
  const { data: prevPrimary } = await supabase
    .from('database_configurations')
    .select('id')
    .eq('organization_id', auth.organizationId)
    .eq('is_primary', true)
    .maybeSingle();

  const previousConfigId = prevPrimary?.id ?? null;

  // Unset all primaries, then set the new one
  await supabase
    .from('database_configurations')
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq('organization_id', auth.organizationId);

  const { error: setErr } = await supabase
    .from('database_configurations')
    .update({ is_primary: true, updated_at: new Date().toISOString() })
    .eq('id', configId);

  if (setErr) { devJson(res, { statusCode: 500, message: setErr.message }, 500); return; }

  // Audit log (non-fatal)
  void supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'database_config.switch_primary',
    resource: 'database_configuration',
    metadata: { configId, previousConfigId, reason: reason ?? null },
  });

  devJson(res, {
    success: true,
    message: `Primary database switched to "${(config as { name: string }).name}"`,
    configId,
    previousConfigId,
  });
}
