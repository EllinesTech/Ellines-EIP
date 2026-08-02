import type { NextConfig } from 'next';

/**
 * Local failures were caused by:
 * 1) `next build` and `next dev` sharing `apps/web/.next` → corrupted chunk cache
 *    (MODULE_NOT_FOUND for `./710.js`, `./825.js`, …)
 * 2) Shell `NODE_ENV=production` leaking from Pages builds into `next dev`, which
 *    used to enable `output: 'export'` and break the local server.
 *
 * Scripts set NEXT_DIST_DIR / EIP_STATIC_EXPORT explicitly (argv is unreliable
 * because Next evaluates this config in child processes).
 */
const distDir = process.env.NEXT_DIST_DIR || '.next';
const staticExport = process.env.EIP_STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  transpilePackages: ['@ellines-eip/shared', '@ellines-eip/ellinea-ai'],
  distDir,
  ...(staticExport ? { output: 'export' as const } : {}),
  images: { unoptimized: true },
  trailingSlash: true,
  allowedDevOrigins: ['192.168.100.147', '100.110.20.83', '192.168.43.46'],
  // TypeScript errors now caught early; separate CI step for full typecheck if needed
  typescript: { ignoreBuildErrors: false },
  // ESLint: no config file in repo yet — skip lint during build to prevent CI hang.
  // (next lint prompts interactively when no .eslintrc exists; blocks CI)
  // Re-enable once ESLint is properly wired up.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
