/**
 * Universal Connector Proxy — POST /api/v1/connectors/proxy
 *
 * The browser cannot reach:
 *   - HTTP (mixed-content block on HTTPS sites)
 *   - Private LAN IPs (192.168.x.x, 10.x.x.x, etc.)
 *   - Any system requiring server-side credentials
 *
 * This edge Function runs on Cloudflare and fetches on behalf of the browser,
 * then normalises the response into the Universal Enterprise Model.
 *
 * The client sends the target URL + auth config; secrets are *never* stored in
 * this request body — the caller either passes them from an already-validated
 * connector installation (server-side lookup by installationId) or provides
 * them directly (IT wizard "test connection" flow).
 */

import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../shared/auth';
import { buildAuthHeaders, normalizeEnterprisePayload, toTimelineStorage } from '../../../shared/connectors';
import type { InstallConfig } from '../../../shared/connectors';

type ProxyBody = {
  /** Resolve config from a saved installation instead of sending credentials inline. */
  installationId?: string;

  /** Direct-call fields (used by test-connection wizard; not stored). */
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  authType?: InstallConfig['authType'];
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;

  /** When true: skip UEM normalisation, return raw response (for test-connection). */
  raw?: boolean;
};

const PRIVATE_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost|::1|0\.0\.0\.0)/i;

function isPrivateTarget(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return PRIVATE_IP_RE.test(hostname);
  } catch {
    return false;
  }
}

/** Hard limit: 512 KB response body to prevent edge memory abuse. */
const MAX_RESPONSE_BYTES = 512 * 1024;

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Only IT Admin / Owner may use the proxy (connector:install covers this).
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  let body: ProxyBody;
  try {
    body = (await context.request.json()) as ProxyBody;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const supabase = getAdminClient(context.env);
  let targetUrl: string;
  let config: InstallConfig = {};

  // ── Resolve config ──────────────────────────────────────────────────────────
  if (body.installationId) {
    const { data: install } = await supabase
      .from('connector_installations')
      .select('*')
      .eq('id', body.installationId)
      .eq('organization_id', auth.organizationId)
      .maybeSingle();

    if (!install) {
      return json({ statusCode: 404, message: 'Connector installation not found' }, 404);
    }

    config = (install.config || {}) as InstallConfig;
    targetUrl = (config.endpoint || '').trim();
    if (!targetUrl) {
      return json(
        { statusCode: 422, message: 'Connector installation has no endpoint configured' },
        422,
      );
    }
  } else {
    targetUrl = (body.url || '').trim();
    if (!targetUrl) {
      return json({ statusCode: 400, message: 'url or installationId is required' }, 400);
    }
    config = {
      authType: body.authType,
      apiKey: body.apiKey,
      apiKeyHeader: body.apiKeyHeader,
      bearerToken: body.bearerToken,
      basicUser: body.basicUser,
      basicPass: body.basicPass,
      headers: body.headers,
    };
  }

  // ── Validate URL ────────────────────────────────────────────────────────────
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return json({ statusCode: 400, message: `Invalid target URL: ${targetUrl}` }, 400);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return json(
      { statusCode: 400, message: 'Only http:// and https:// targets are supported' },
      400,
    );
  }

  // Log a note when proxying private IPs (common for on-prem systems on client VPN).
  const isPrivate = isPrivateTarget(targetUrl);

  // ── Build request ────────────────────────────────────────────────────────────
  const authHeaders = buildAuthHeaders(config);
  const allHeaders: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'EllineEIP-Proxy/1.0',
    ...authHeaders,
  };
  if (body.headers && !body.installationId) {
    Object.assign(allHeaders, body.headers);
  }

  const method = (body.method || 'GET').toUpperCase();
  const fetchInit: RequestInit = {
    method,
    headers: allHeaders,
  };
  if (body.body && method !== 'GET' && method !== 'HEAD') {
    fetchInit.body = body.body;
    if (!allHeaders['Content-Type']) {
      allHeaders['Content-Type'] = 'application/json';
    }
  }

  // ── Proxy ────────────────────────────────────────────────────────────────────
  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, fetchInit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    const hint = isPrivate
      ? ' This is a private IP — ensure the Cloudflare network can reach it (VPN / site-to-site tunnel or expose via a DMZ).'
      : '';
    return json(
      {
        statusCode: 502,
        message: `Proxy could not reach ${parsedUrl.hostname}: ${msg}${hint}`,
        isPrivateTarget: isPrivate,
        target: parsedUrl.hostname,
      },
      502,
    );
  }

  // ── Read body (size-limited) ─────────────────────────────────────────────────
  let rawText = '';
  try {
    const reader = upstream.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      rawText = new TextDecoder().decode(
        chunks.reduce((acc, c) => {
          const merged = new Uint8Array(acc.length + c.length);
          merged.set(acc, 0);
          merged.set(c, acc.length);
          return merged;
        }, new Uint8Array(0)),
      );
    } else {
      rawText = await upstream.text();
    }
  } catch {
    rawText = '';
  }

  if (!upstream.ok) {
    return json(
      {
        statusCode: upstream.status,
        message: `Target returned ${upstream.status} ${upstream.statusText}`,
        upstreamStatus: upstream.status,
        target: parsedUrl.hostname,
        responseSnippet: rawText.slice(0, 500),
      },
      upstream.status >= 500 ? 502 : upstream.status,
    );
  }

  // ── Return raw (test-connection mode) ────────────────────────────────────────
  if (body.raw) {
    let parsed: unknown = rawText;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // return as text
    }
    return json({
      ok: true,
      status: upstream.status,
      isPrivateTarget: isPrivate,
      target: parsedUrl.hostname,
      raw: typeof parsed === 'string' ? parsed.slice(0, 2000) : parsed,
    });
  }

  // ── Normalise into UEM ───────────────────────────────────────────────────────
  let rawData: unknown = rawText;
  try {
    rawData = JSON.parse(rawText);
  } catch {
    // treat as plain text — build a minimal UEM-compatible wrapper
    rawData = {
      briefHighlight: rawText.slice(0, 400) || 'No parseable response body.',
      timeline: [
        {
          title: 'Proxy response',
          detail: `Non-JSON response from ${parsedUrl.hostname} (${upstream.status})`,
        },
      ],
    };
  }

  const payload = normalizeEnterprisePayload(rawData);

  // ── Audit ────────────────────────────────────────────────────────────────────
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'connector.proxy.fetch',
    resource: 'connector_proxy',
    metadata: {
      target: parsedUrl.hostname,
      isPrivate,
      status: upstream.status,
      installationId: body.installationId || null,
    },
  });

  return json({
    ok: true,
    target: parsedUrl.hostname,
    isPrivateTarget: isPrivate,
    upstreamStatus: upstream.status,
    ...payload,
    timeline: toTimelineStorage(payload),
    syncedAt: new Date().toISOString(),
  });
};
