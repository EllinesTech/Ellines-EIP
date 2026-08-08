import type { NextConfig } from 'next';

const distDir = process.env.NEXT_DIST_DIR || '.next';

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
