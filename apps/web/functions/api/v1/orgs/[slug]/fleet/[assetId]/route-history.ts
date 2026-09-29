/**
 * GET /api/v1/orgs/:slug/fleet/:assetId/route-history
 *
 * Returns historical route data for a specific asset.
 * Requires authenticated owner or admin role.
 *
 * Query params:
 *   from  — ISO datetime (inclusive)
 *   to    — ISO datetime (inclusive)
 *
 * Response shape:
 *   { assetId, from, to, totalDistance, movingTime, idleTime, stops[], track[] }
 *
 * Requirements 30.2: Historical route playback.
 * Tenant isolation: organizationId from JWT claim only (Security §6).
 */

import { requireAuth, json, options, type Env } from '../../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!['owner', 'admin'].includes(auth.role)) {
    return json({ message: 'Forbidden' }, 403);
  }

  const orgId = auth.organizationId;

  // Extract assetId from path params
  const assetId =
    typeof context.params?.assetId === 'string'
      ? context.params.assetId
      : Array.isArray(context.params?.assetId)
      ? context.params.assetId[0]
      : '';

  if (!assetId) {
    return json({ message: 'assetId is required' }, 400);
  }

  const url = new URL(context.request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 86_400_000);
  const to = toParam ? new Date(toParam) : new Date();

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return json({ message: 'Invalid from/to date parameters' }, 400);
  }

  // Route history requires InfluxDB integration which is not provisioned in
  // the Pages Functions environment. Return the stable contract shape with
  // empty track data and a note field so clients can render the placeholder.
  return json({
    assetId,
    orgId,
    from: from.toISOString(),
    to: to.toISOString(),
    totalDistance: 0,
    movingTime: 0,
    idleTime: 0,
    stops: [],
    track: [],
    note: 'Route history requires InfluxDB integration. GPS track data will appear here once the integration is active.',
  });
};
