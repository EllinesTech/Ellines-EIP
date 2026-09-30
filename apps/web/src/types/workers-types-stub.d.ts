/**
 * Stub for `@cloudflare/workers-types` — WEB BUILD ONLY.
 *
 * The generated Route Handler shims pull `functions/api/**` into the Next.js
 * program. A handful of handlers `import { PagesFunction } from
 * '@cloudflare/workers-types'`, which loads the real package and therefore its
 * GLOBAL scope: Workers' `Request`/`Response`/`EventContext`, which are
 * structurally incompatible with `lib.dom`'s (Workers `Response` carries
 * `webSocket`/`cf`). That made three SSO handlers fail to typecheck locally for
 * reasons that have nothing to do with local development.
 *
 * `tsconfig.json` maps the bare specifier here, so the web program sees a single
 * loose `PagesFunction` and the globals resolve to `cloudflare-pages.d.ts`.
 *
 * This affects TYPES ONLY. The authoritative strict check of every Function runs
 * in `apps/web/functions/tsconfig.json`, which resolves the real package.
 */
declare module '@cloudflare/workers-types' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type PagesFunction<Env = any> = (context: any) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type EventContext<Env = any, Data = any, Provider = any> = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ExecutionContext = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const KVNamespace: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const ExecutionContext: any;
}

/**
 * `cloudflare:sockets` is a Workers-only virtual module. Several database
 * connectors probe for it at runtime and degrade gracefully when it is absent,
 * so the web build only needs the specifier to RESOLVE — the value is never
 * used outside the Workers runtime.
 */
declare module 'cloudflare:sockets' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const connect: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _default: any;
  export default _default;
}
