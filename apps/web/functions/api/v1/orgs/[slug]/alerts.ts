/**
 * GET /api/v1/orgs/:slug/alerts
 *
 * Returns recent alerts and correlated alert clusters for an organisation.
 * Auth: any authenticated member of the organisation.
 *
 * Response shape:
 *   { alerts: [], clusters: AlertCluster[] }
 *
 * The `alerts` array is reserved for future direct alert delivery. The
 * `clusters` field carries the correlated root-cause groupings derived from
 * recent audit log entries (Requirements 12.6, 12.8).
 *
 * For the initial implementation, clusters is always [] because live alert
 * data is produced by the NestJS identity service at runtime — not available
 * directly from Pages Functions. The field is present so client code can rely
 * on the response shape today.
 */

import { requireAuth, json, options, type Env } from '../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/** Minimal AlertCluster shape — mirrors alert-correlation.service.ts in identity. */
interface AlertCluster {
  clusterId: string;
  alerts: unknown[];
  rootCause: unknown | null;
  windowStartMs: number;
  windowEndMs: number;
  createdAt: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  // Gate on any authenticated user (any role within the org).
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Clusters will be populated by the identity service in future iterations.
  // The empty array keeps the response shape stable for API consumers.
  const clusters: AlertCluster[] = [];

  return json({
    alerts: [],
    clusters,
  });
};
