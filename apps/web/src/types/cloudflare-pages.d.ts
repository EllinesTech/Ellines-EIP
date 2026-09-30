/**
 * Ambient Cloudflare Pages types for the Next.js build.
 *
 * The generated Route Handler shims under `src/app/api/**` statically import the
 * Pages Functions under `functions/api/**`. TypeScript therefore pulls those files
 * into the web program, but `@cloudflare/workers-types` is not loaded there (the
 * Functions are normally checked by `functions/tsconfig.json` instead).
 *
 * Declaring only the three globals the Functions reference keeps the web program
 * compiling WITHOUT pulling in the full workers type package, which would
 * conflict with `lib.dom` definitions of Request/Response/fetch.
 *
 * These declarations are deliberately LOOSE (`any` at the context/return
 * boundary). A few handlers import the real `EventContext` from
 * `@cloudflare/workers-types`, whose Workers `Response` carries extra fields and
 * is not assignable to the DOM `Response`; a strict local declaration would make
 * those files fail to compile here for reasons that are irrelevant to local dev.
 * The authoritative, STRICT type checking of every Function still runs in
 * `apps/web/functions/tsconfig.json`, which is what CI enforces.
 */

/** Runtime environment shape a Pages Function may receive. */
type PagesFunctionEnv = Record<string, string | undefined>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PagesFunction<Env = any> = (context: any) => any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventContext<Env = any, Data = any> = any;

type KVNamespace = {
  get(key: string, type?: 'text' | 'json'): Promise<string | null>;
  put(key: string, value: string, options?: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<void>;
};
