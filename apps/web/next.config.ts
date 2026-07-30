import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ellines-eip/shared'],
  // Static export only for production Pages deploy; keep full Next server in `next dev`.
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' as const } : {}),
  images: { unoptimized: true },
  trailingSlash: true,
  allowedDevOrigins: ['192.168.100.147', '100.110.20.83', '192.168.43.46'],
  // Windows static-export builds race on generated .next/types; ship UI while CI typechecks later.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
