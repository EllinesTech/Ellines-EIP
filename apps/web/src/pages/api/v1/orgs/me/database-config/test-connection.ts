/**
 * Dev Pages API: POST /api/v1/orgs/me/database-config/test-connection
 * Pages Router API routes are IGNORED during static export builds.
 * This only runs locally — production uses the real Cloudflare Pages Function.
 *
 * In local dev, direct TCP connections are possible so we forward the test
 * to the identity service which has pg access. If identity is not running,
 * we return a helpful message.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, requireDevAuth, isOrgAdmin } from '../../../../../../lib/dev-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }
  if (req.method !== 'POST') { devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;
  if (!isOrgAdmin(auth.role)) { devJson(res, { statusCode: 403, message: 'Admins only' }, 403); return; }

  const { type, host, port, username, password, databaseName, supabaseUrl, supabaseKey } = req.body || {};

  if (!type) { devJson(res, { statusCode: 400, message: 'type is required' }, 400); return; }

  // For Supabase: do a lightweight auth check
  if (type === 'supabase') {
    if (!supabaseUrl || !supabaseKey) {
      devJson(res, { statusCode: 400, message: 'supabaseUrl and supabaseKey are required for Supabase connections' }, 400);
      return;
    }
    try {
      const testRes = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        signal: AbortSignal.timeout(8000),
      });
      devJson(res, {
        success: testRes.ok || testRes.status === 400,
        message: testRes.ok ? 'Supabase connection verified' : `Supabase returned HTTP ${testRes.status} — check your URL and key`,
        canTest: true,
      });
    } catch (err) {
      devJson(res, { success: false, message: err instanceof Error ? err.message : 'Connection failed', canTest: true });
    }
    return;
  }

  // For local/custom_postgres: forward to identity service if running
  const identityBase = 'http://localhost:3001';
  try {
    const fwdRes = await fetch(`${identityBase}/api/v1/database/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers['authorization'] || '',
      },
      body: JSON.stringify({ type, host, port, username, password, databaseName }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await fwdRes.json().catch(() => ({}));
    res.status(fwdRes.status).json(body);
  } catch {
    // Identity service not running — give helpful local guidance
    devJson(res, {
      success: false,
      canTest: false,
      message: 'Identity service is not running (localhost:3001). Start it with `npm run dev:identity` to test PostgreSQL connections locally.',
      suggestion: `Connection details: ${type} — ${host ?? 'localhost'}:${port ?? 5432}/${databaseName ?? ''}`,
    });
  }
}
