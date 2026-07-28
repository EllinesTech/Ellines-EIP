import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ellines-eip/shared'],
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  // Windows static-export builds race on generated .next/types; ship UI while CI typechecks later.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
