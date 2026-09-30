/**
 * Run a Cloudflare Pages Function from a Next.js **Pages Router** API route.
 *
 * WHY PAGES ROUTER (not App Router)
 * ---------------------------------
 * `src/pages/api/**` is this repo's established convention for LOCAL-ONLY API
 * routes. The existing hand-written dev routes say so explicitly:
 *
 *   "Pages Router API routes are IGNORED during static export builds.
 *    This only runs locally — production uses the real Cloudflare Pages Function."
 *
 * Using that directory means the generated routes are excluded from the
 * production static export by Next.js itself, so no build step has to delete
 * them. An earlier App-Router version needed a `prebuild --clean` hook, which
 * silently broke any dev server that happened to be running.
 *
 * CLOUDFLARE FUNCTIONS ARE THE SINGLE SOURCE OF TRUTH. Each generated route
 * imports and invokes the ORIGINAL `functions/api/**` handler; there is no
 * second implementation and no duplicated business logic.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

type PagesHandler = (context: {
  request: Request;
  env: Record<string, string | undefined>;
  params: Record<string, string>;
  next: () => Promise<Response>;
  functionPath: string;
  data: Record<string, unknown>;
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
}) => Response | Promise<Response>;

/** Expand normalised route params back into the names the Pages Function expects. */
export function expandParams(
  raw: Record<string, string | string[]>,
  aliases: Record<string, string[]> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v;
  }
  for (const [canonical, names] of Object.entries(aliases)) {
    const value = out[canonical];
    if (value === undefined) continue;
    for (const name of names) out[name] = value;
  }
  return out;
}

/** Build a fetch `Request` from a Next API request. */
function toFetchRequest(req: NextApiRequest): Request {
  const url = new URL(req.url ?? '/', 'http://localhost:3100');
  // Re-serialise query params so the Pages Function sees the same URL.
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (key === 'id' || key === 'wid' || key === 'itemId' || key === 'execId') continue;
    if (typeof value === 'string') url.searchParams.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }

  const method = (req.method ?? 'GET').toUpperCase();
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      init.body = req.body as string;
    } else {
      init.body = JSON.stringify(req.body);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
  }
  return new Request(url.toString(), init);
}

/** Write a fetch `Response` to a Next API response. */
async function writeResponse(res: NextApiResponse, response: Response): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, key) => {
    // Skip hop-by-hop / encoding headers Next manages itself.
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) return;
    res.setHeader(key, value);
  });
  const text = await response.text();
  res.end(text);
}

/**
 * Default export for a generated `src/pages/api/**` route.
 */
export default async function runPagesApiRoute(
  handler: PagesHandler,
  req: NextApiRequest,
  res: NextApiResponse,
  aliases: Record<string, string[]> = {},
): Promise<void> {
  // `req.query` also carries the dynamic route params; split them from the
  // query string so the function receives them in `context.params`.
  const params = expandParams(
    (req.query ?? {}) as Record<string, string | string[]>,
    aliases,
  );

  const context = {
    request: toFetchRequest(req),
    env: process.env as Record<string, string | undefined>,
    params,
    next: async () => new Response('Not found', { status: 404 }),
    functionPath: req.url ?? '/',
    data: {},
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  };

  try {
    const response = await handler(context as never);
    await writeResponse(res, response);
  } catch (err) {
    // Never leak a stack trace or a secret to the client.
    const message = err instanceof Error ? err.message : 'Unhandled function error';
    console.error('[pages-fn-adapter] handler threw:', message);
    if (!res.headersSent) {
      res.status(500).json({ statusCode: 500, message: 'Internal error' });
    }
  }
}
