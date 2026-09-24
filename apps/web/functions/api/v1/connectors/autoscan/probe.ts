import {
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';
import { isSafeEgressTarget, safeFetch, SsrfError } from '../../../../shared/egress';

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

  // Shared SSRF policy — replaces the removed isBlockedHost()
  const egressCheck = isSafeEgressTarget(urlStr);
  if (!egressCheck.safe) {
    return {
      url: urlStr,
      reachable: false,
      error: egressCheck.reason ??
        'Edge probe skips localhost / private LAN. Use Local mode with the full SoR URL. Scan ≠ connect — after reachability, click Connect → credentials → Test & Sync.',
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // safeFetch re-validates on every redirect hop (DNS-rebinding protection)
    const res = await safeFetch(url.toString(), {
      method: 'GET',
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
      const text = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(slice);
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
    if (err instanceof SsrfError) {
      return {
        url: urlStr,
        reachable: false,
        error: `SSRF policy blocked redirect: ${err.blockedUrl}`,
        latencyMs: Date.now() - started,
      };
    }
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
