import type { NextConfig } from 'next';

/**
 * Build configuration for Ellines EIP web app.
 * 
 * DEPLOYMENT MODEL:
 * - Cloudflare Pages Functions handles all routing (server-side)
 * - Next.js runs as a server application (output: 'standalone')
 * - Pages are rendered on-demand by the server runtime
 * 
 * NO STATIC EXPORT:
 * - Pages Functions requires server-side routing, not static files
 * - Using 'standalone' output ensures server-side rendering
 * - Root layout has `force-dynamic` to prevent static generation attempts
 * - This avoids React error #31 from pre-rendering complex error pages
 * 
 * WORKAROUND for React #31:
 * - Pre-rendering error pages (/404, /_error) triggers React error #31
 * - Cause: Component tree error during static generation
 * - Fix: `force-dynamic` in root layout prevents pre-rendering
 * - Result: All pages rendered on-demand, no build errors
 */
const distDir = process.env.NEXT_DIST_DIR || '.next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ellines-eip/shared', '@ellines-eip/ellinea-ai'],
  distDir,
  output: 'standalone', // Server application for Pages Functions
  images: { unoptimized: true },
  trailingSlash: true,
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
