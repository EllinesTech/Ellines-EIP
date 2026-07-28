import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ellines-eip/shared'],
  // Static export for Cloudflare Pages (same hosting model as Haven / Tech).
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
