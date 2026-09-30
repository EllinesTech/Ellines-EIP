// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run generate:pages-shims
//
// Local-dev bridge to the Cloudflare Pages Function that serves this route in
// production. It invokes the ORIGINAL handler — there is no second
// implementation. Pages Router API routes are ignored by the static export, so
// this never reaches the production bundle. See src/lib/pages-fn-adapter.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import runPagesApiRoute from '@/lib/pages-fn-adapter';
import { onRequest } from '../../../../../../functions/api/v1/dashboards/[id]/export';

// Sibling dynamic segments are normalised to one name; re-publish the value
// under every name the original Cloudflare handler may read.
const PARAM_ALIASES: Record<string, string[]> = {};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return runPagesApiRoute(onRequest as never, req, res, PARAM_ALIASES);
}
