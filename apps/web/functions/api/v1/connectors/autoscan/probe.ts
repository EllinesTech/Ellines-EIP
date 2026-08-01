import {
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

type ProbeBody = {
  targets?: string[];
  /** Optional catalog force (e.g. hospidia) — hints only; does not change fetch. */
  catalogId?: string;
  timeoutMs?: number;
};

type ProbeItem = {
  url: string;
  reachable: boolean;
  status?: number;
  title?: string;
  contentType?: string;
  server?: string;
  snippet?: string;
  error?: string;
  latencyMs?: number;
};

const MAX_TARGETS = 16;
const DEFAULT_TIMEOUT = 2500;
const MAX_TIMEOUT = 5000;
const MAX_BODY = 48_000;

/** Block obvious SSRF / cloud-metadata targets from the edge probe. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h === 'metadata.google.internal') return true;
  if (h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
  if (h === '169.254.169.254' || h.endsWith('.local')) return true;
  // Private / link-local IPv4 — edge cannot reach LAN usefully; refuse to pretend.
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  return m?.[1]?.trim() || undefined;
}

async function probeOne(urlStr: string, timeoutMs: number): Promise<ProbeItem> {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { url: urlStr, reachable: false, error: 'Invalid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { url: urlStr, reachable: false, error: 'Only http/https allowed' };
  }
  if (isBlockedHost(url.hostname)) {
    return {
      url: urlStr,
      reachable: false,
      error:
        'Edge probe skips localhost / private LAN. Use Local mode with the full SoR URL (any path — exact URL is probed first). Scan ≠ connect — after reachability, click Connect → credentials → Test & Sync.',
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/html, application/yaml, text/plain, */*',
        'user-agent': 'Ellines-EIP-Autoscan/1.0 (Owner-IT assisted; read-only probe)',
      },
    });
    const contentType = res.headers.get('content-type') || undefined;
    const server = res.headers.get('server') || undefined;
    let title: string | undefined;
    let snippet: string | undefined;
    try {
      const buf = await res.arrayBuffer();
      const slice = buf.byteLength > MAX_BODY ? buf.slice(0, MAX_BODY) : buf;
      const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      if (
        (contentType && /html/i.test(contentType)) ||
        text.trimStart().startsWith('<')
      ) {
        title = extractTitle(text);
        snippet = text.replace(/\s+/g, ' ').slice(0, 400);
      } else {
        snippet = text.replace(/\s+/g, ' ').slice(0, 400);
      }
    } catch {
      /* ignore body */
    }
    return {
      url: urlStr,
      reachable: true,
      status: res.status,
      title,
      contentType,
      server,
      snippet,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      url: urlStr,
      reachable: false,
      error: err instanceof Error ? err.message : 'unreachable',
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/v1/connectors/autoscan/probe
 * Owner/IT only. Probes user-supplied public HTTPS/HTTP URLs (no disk crawl).
 * Local / private hosts must be scanned from the browser (Local / Hybrid mode).
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

  let body: ProbeBody = {};
  try {
    body = (await context.request.json()) as ProbeBody;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const rawTargets = Array.isArray(body.targets) ? body.targets : [];
  if (!rawTargets.length) {
    return json({ statusCode: 400, message: 'targets[] required' }, 400);
  }
  const targets = [...new Set(rawTargets.map((t) => String(t).trim()).filter(Boolean))].slice(
    0,
    MAX_TARGETS,
  );
  const timeoutMs = Math.min(
    MAX_TIMEOUT,
    Math.max(800, Number(body.timeoutMs) || DEFAULT_TIMEOUT),
  );

  const results: ProbeItem[] = [];
  for (const t of targets) {
    results.push(await probeOne(t, timeoutMs));
  }

  return json({
    mode: 'online-edge',
    catalogId: body.catalogId || null,
    limits: {
      maxTargets: MAX_TARGETS,
      timeoutMs,
      note: 'Probes only URLs IT submitted. No filesystem access. Private LAN must use browser Local scan.',
    },
    results,
  });
};
