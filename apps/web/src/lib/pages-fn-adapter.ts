/**
 * Adapter that runs a Cloudflare Pages Function inside a Next.js Route Handler.
 *
 * WHY THIS EXISTS
 * ---------------
 * In production, Cloudflare Pages serves every `functions/api/**` route natively.
 * Locally, `apps/web/next.config.ts` rewrites all `/api/v1/*` to the NestJS
 * identity service, and `next.config.ts` assumes Next.js Route Handlers shadow
 * that rewrite. They never existed — so Pages-only routes (dashboards,
 * connector health, attention) returned 404 locally while working in production.
 *
 * This adapter lets generated Route Handlers reuse the EXACT same Pages Function
 * modules, so local behaviour matches production instead of diverging from it.
 * There is no second implementation: the handler under `functions/` stays the
 * single source of truth.
 *
 * Next.js filesystem routes are matched BEFORE rewrites, so these shims take
 * precedence; any `/api/*` path with no Pages Function still falls through to
 * the NestJS rewrite, exactly as intended.
 */

import type { NextRequest } from 'next/server';

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

/** Minimal shape of the Cloudflare Pages Functions context the handlers use. */
export type PagesContext = Parameters<PagesHandler>[0];

/**
 * Execute a Pages Function for a Next.js route handler.
 *
 * `env` is `process.env` in local dev (Next loads `.env.local`) and the Pages
 * bindings in production. Handlers fail closed on missing secrets, so a missing
 * key surfaces as a clear 500 rather than silently degraded behaviour.
 */
export async function runPagesFunction(
  handler: PagesHandler,
  request: NextRequest | Request,
  params: Record<string, string> = {},
  env: Record<string, string | undefined> = process.env,
): Promise<Response> {
  // Pages Functions read `request` as a standard fetch Request. NextRequest is
  // one, so it can be passed straight through.
  const context: PagesContext = {
    request: request as Request,
    env,
    params,
    next: async () => new Response('Not found', { status: 404 }),
    functionPath: new URL((request as Request).url).pathname,
    data: {},
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  };

  try {
    return await handler(context);
  } catch (err) {
    // Never surface a stack trace or a secret to the client.
    const message = err instanceof Error ? err.message : 'Unhandled function error';
    console.error('[pages-fn-adapter] handler threw:', message);
    return new Response(
      JSON.stringify({ statusCode: 500, message: 'Internal error' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}

/** Standard metadata for generated shims: always dynamic, Node runtime. */
export const PAGE_HANDLER_META = {
  dynamic: 'force-dynamic',
  runtime: 'nodejs',
} as const;

/**
 * Expand normalised route params back into the names the Pages Function expects.
 *
 * Next.js forbids two different dynamic-segment names at the same path position
 * ("You cannot use different slug names for the same dynamic path"), whereas
 * Cloudflare Pages allows it — e.g. `inbox/[accountId]/*` and
 * `inbox/[messageId]/*` are siblings there. The generator therefore normalises
 * both to one folder name, and the raw value is re-published under every alias
 * so the original handler still finds `params.accountId` / `params.messageId`.
 */
export function expandParams(
  raw: Record<string, string>,
  aliases: Record<string, string[]> = {},
): Record<string, string> {
  const out: Record<string, string> = { ...raw };
  for (const [canonical, names] of Object.entries(aliases)) {
    const value = raw[canonical];
    if (value === undefined) continue;
    for (const name of names) out[name] = value;
  }
  return out;
}
