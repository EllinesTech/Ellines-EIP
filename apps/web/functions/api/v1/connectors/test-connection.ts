import {
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { egressRequest, EgressBlockedError } from '@ellines-eip/shared';

/**
 * POST /api/v1/connectors/test-connection
 * Tests connectivity to a user-supplied URL through the SSRF guard.
 * Credential values are NEVER returned in the response.
 *
 * Requirements: 14.5, 24.4, 19.2 (spec)
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try { body = await context.request.json() as Record<string, unknown>; }
  catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return json({ statusCode: 422, message: 'url is required' }, 422);

  const started = Date.now();

  try {
    const response = await egressRequest({
      url,
      method: 'GET',
      timeoutMs: 10_000,
      maxRetries: 0, // single attempt for test
    });

    const latencyMs = Date.now() - started;

    return json({
      success: response.ok,
      latencyMs,
      statusCode: response.status,
      message: response.ok
        ? `Connected successfully (HTTP ${response.status})`
        : `Server returned HTTP ${response.status}`,
    });
  } catch (err) {
    if (err instanceof EgressBlockedError) {
      // Req 14.5: never expose internal block_reason to client
      return json({
        statusCode: 422,
        message: 'This URL cannot be reached from EIP',
      }, 422);
    }

    const latencyMs = Date.now() - started;
    return json({
      success: false,
      latencyMs,
      statusCode: null,
      message: err instanceof Error ? err.message : 'Connection failed',
    });
  }
};
