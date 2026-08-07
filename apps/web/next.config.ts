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
};

export default nextConfig;
