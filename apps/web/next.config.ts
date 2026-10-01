import type { NextConfig } from 'next';
import path from 'node:path';

const distDir = process.env.NEXT_DIST_DIR || '.next';
const webRoot = process.cwd();

// EIP_STATIC_EXPORT=1 is set by the production build script (npm run build -w @ellines-eip/web).
// In dev mode (next dev) we run as a full Next.js server so no static export is needed.
const isStaticExport = process.env.EIP_STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  transpilePackages: ['@ellines-eip/shared', '@ellines-eip/ellinea-ai'],
  distDir,
  ...(isStaticExport ? { output: 'export' } : {}),
  images: { unoptimized: true },
  trailingSlash: true,
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },


  // socket.io-client is an optional peer dependency used only at runtime when the
  // WebSocket gateway is available. Mark it as an external so webpack does not
  // attempt to bundle it during the static export build (it is not installed).
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'socket.io-client': false,
        // Node-only modules used by @ellines-eip/shared (encryption, egress).
        // These are never called from browser code; stub them so webpack does
        // not fail the client bundle when it encounters the imports.
        'crypto': false,
        'dns': false,
      };
    }

    // The generated Route Handler shims pull in the Pages Functions, a few of
    // which probe for the Workers-only `cloudflare:sockets` module at runtime:
    //
    //   let mod = null;
    //   try { mod = await import('cloudflare:sockets'); } catch { ... }
    //
    // webpack cannot resolve the `cloudflare:` scheme, which fails the whole
    // server bundle. IgnorePlugin makes the specifier resolve to nothing, so the
    // dynamic import rejects and the caller's existing catch runs — exactly the
    // behaviour on a runtime without the module. Production (Cloudflare Pages)
    // never uses this config.
    config.plugins = config.plugins || [];
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^cloudflare:sockets$/ }));

    return config;
  },

  // In dev, proxy NestJS-handled /api/v1/* routes through to localhost:3001.
  // Routes that have Next.js Route Handlers (Pages-Function equivalents) are
  // served by Next.js itself and are NOT caught by this rewrite because
  // Next.js matches its own /api routes before falling through to rewrites.
  ...(!isStaticExport
    ? {
        async rewrites() {
          return {
            beforeFiles: [],
            afterFiles: [],
            // These run AFTER Next.js checks its own routes (Route Handlers).
            // So /api/v1/orgs/me/invite etc. served by Route Handlers win;
            // everything else is proxied to the NestJS identity service.
            fallback: [
              {
                source: '/api/v1/:path*',
                destination: 'http://localhost:3001/api/v1/:path*',
              },
            ],
          };
        },
      }
    : {}),
};

export default nextConfig;
