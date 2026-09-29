/**
 * GET /api/v1/orgs/:slug/fleet/utilization
 *
 * Returns asset utilisation metrics for the organisation.
 * Requires authenticated owner or admin role.
 *
 * Query params:
 *   assetId  — optional; if omitted returns org-level summary
 *   from     — ISO datetime (defaults to 30 days ago)
 *   to       — ISO datetime (defaults to now)
 *
 * Response shape:
 *   { utilization: UtilisationPeriod[], note?: string }
 *
 * Requirements 30.4: Asset utilisation analytics.
 * Tenant isolation: organizationId from JWT claim only (Security §6).
 */

import { requireAuth, json, options, type Env } from '../../../../../shared/auth';
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

  const url = new URL(context.request.url);
  const assetId = url.searchParams.get('assetId') ?? undefined;
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 86_400_000);
  const to = toParam ? new Date(toParam) : new Date();

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return json({ message: 'Invalid from/to date parameters' }, 400);
  }

  // Utilisation calculation requires InfluxDB telemetry.
  // Return the contract shape with placeholder data and a clear note.
  const totalHours =
    (to.getTime() - from.getTime()) / (1000 * 60 * 60);

  const placeholder = {
    assetId: assetId ?? 'org-aggregate',
    orgId,
    from: from.toISOString(),
    to: to.toISOString(),
    totalHours: Math.round(totalHours * 10) / 10,
    activeHours: 0,
    idleHours: Math.round(totalHours * 10) / 10,
    utilisationPercent: 0,
  };

  return json({
    utilization: [placeholder],
    note: 'Utilisation analytics require InfluxDB telemetry integration. Figures will populate once the integration is active.',
  });
};
