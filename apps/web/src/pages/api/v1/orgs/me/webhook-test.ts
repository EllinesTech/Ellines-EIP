/**
 * Dev Pages API: POST /api/v1/orgs/me/webhook-test
 * Pages Router API routes are IGNORED during static export builds.
 * This only runs locally — production uses the real Cloudflare Pages Function.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, requireDevAuth, isOrgAdmin } from '../../../../../lib/dev-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }
  if (req.method !== 'POST') { devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;
  if (!isOrgAdmin(auth.role)) { devJson(res, { statusCode: 403, message: 'Admins only' }, 403); return; }

  const { url, secret, event = 'eip.test' } = req.body || {};
  if (!url) { devJson(res, { statusCode: 400, message: 'url is required' }, 400); return; }

  const payload = {
    event,
    organizationId: auth.organizationId,
    timestamp: new Date().toISOString(),
    test: true,
  };

  const startMs = Date.now();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) {
      // Simple HMAC placeholder for local dev — production uses real crypto
      headers['X-EIP-Signature'] = `sha256=dev-signature`;
    }
    const resp = await fetch(url as string, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - startMs;
    devJson(res, {
      success: resp.ok,
      statusCode: resp.status,
      latencyMs,
      message: resp.ok ? 'Test delivery succeeded' : `Target returned HTTP ${resp.status}`,
    });
  } catch (err) {
    devJson(res, {
      success: false,
      statusCode: null,
      latencyMs: Date.now() - startMs,
      message: err instanceof Error ? err.message : 'Test delivery failed',
    });
  }
}
