/**
 * GET /api/v1/orgs/:slug/fleet/locations
 *
 * Returns real-time asset locations for the organisation.
 * Requires authenticated owner or admin role.
 *
 * Query params:
 *   branchId  — filter by branch
 *   status    — filter by asset status
 *   kind      — filter by asset kind
 *
 * Response shape:
 *   { assets: AssetLocation[], total: number }
 *
 * Requirements 30.1: Real-time asset location tracking.
 * Tenant isolation: organizationId is resolved from the JWT claim —
 *   never accepted from the query string (Security §6).
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

  // Gate: owner or admin only
  if (!['owner', 'admin'].includes(auth.role)) {
    return json({ message: 'Forbidden' }, 403);
  }

  const orgId = auth.organizationId;

  const url = new URL(context.request.url);
  const branchId = url.searchParams.get('branchId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const kind = url.searchParams.get('kind') ?? undefined;

  // Fleet data derives from the latest EnterpriseSnapshot.
  // The identity service's FleetTrackingService holds the business logic;
  // Pages Functions read Supabase directly via the admin client.
  // For now we surface a stable contract with placeholder data sourced from
  // the enterprise snapshot via Supabase REST.

  try {
    const { getAdminClient } = await import('../../../../../shared/auth');
    const supabase = getAdminClient(context.env);

    // Fetch latest synced snapshot for this org (mandatory org filter)
    const { data: snapshot, error } = await supabase
      .from('EnterpriseSnapshot')
      .select('model')
      .eq('organizationId', orgId)
      .eq('status', 'synced')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[fleet/locations] snapshot query error:', error.message);
      return json({ assets: [], total: 0 });
    }

    if (!snapshot) {
      return json({ assets: [], total: 0 });
    }

    const model = (snapshot.model ?? {}) as Record<string, unknown>;
    const objects = Array.isArray(model.objects)
      ? (model.objects as Record<string, unknown>[])
      : [];

    let assets = objects.filter((o) => o.kind === 'asset');

    if (branchId) assets = assets.filter((o) => o.branchId === branchId);
    if (status) {
      assets = assets.filter(
        (o) => String(o.status || '').toLowerCase() === status.toLowerCase(),
      );
    }
    if (kind) {
      assets = assets.filter(
        (o) => String(o.kind || '').toLowerCase() === kind.toLowerCase(),
      );
    }

    const locations = assets.map((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      const gpsRaw = (o.gps ?? meta.gps ?? null) as Record<string, unknown> | null;
      return {
        assetId: String(o.id || ''),
        assetName: String(o.name || ''),
        kind: String(o.kind || 'asset'),
        status: o.status ? String(o.status) : undefined,
        branchId: o.branchId ? String(o.branchId) : undefined,
        gps: gpsRaw
          ? {
              lat: Number(gpsRaw.lat ?? 0),
              lng: Number(gpsRaw.lng ?? gpsRaw.lon ?? 0),
              timestamp: gpsRaw.timestamp ? Number(gpsRaw.timestamp) : undefined,
              speedKph: gpsRaw.speed ? Number(gpsRaw.speed) : undefined,
              heading: gpsRaw.heading ? Number(gpsRaw.heading) : undefined,
            }
          : undefined,
      };
    });

    return json({ assets: locations, total: locations.length });
  } catch (err) {
    console.error('[fleet/locations] error:', (err as Error).message);
    return json({ message: 'Internal server error' }, 500);
  }
};
