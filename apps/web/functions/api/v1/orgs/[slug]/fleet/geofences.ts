/**
 * POST /api/v1/orgs/:slug/fleet/geofences
 *
 * Create a new geofence for the organisation.
 * Requires authenticated owner or admin role.
 *
 * Request body:
 *   {
 *     name: string
 *     type: 'circle' | 'polygon'
 *     centerLat?: number
 *     centerLng?: number
 *     radiusMeters?: number
 *     polygon?: [number, number][]
 *     active?: boolean
 *   }
 *
 * Response shape:
 *   { geofence: GeofenceDefinition }
 *
 * Requirements 30.3: Geofence creation and management.
 * Tenant isolation: organizationId from JWT claim only (Security §6).
 */

import { requireAuth, json, options, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

interface GeofenceBody {
  name?: string;
  type?: 'circle' | 'polygon';
  centerLat?: number;
  centerLng?: number;
  radiusMeters?: number;
  polygon?: [number, number][];
  active?: boolean;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!['owner', 'admin'].includes(auth.role)) {
    return json({ message: 'Forbidden' }, 403);
  }

  const orgId = auth.organizationId;

  let body: GeofenceBody;
  try {
    body = (await context.request.json()) as GeofenceBody;
  } catch {
    return json({ message: 'Invalid JSON body' }, 400);
  }

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return json({ message: 'name is required' }, 400);
  }

  if (!body.type || !['circle', 'polygon'].includes(body.type)) {
    return json({ message: 'type must be "circle" or "polygon"' }, 400);
  }

  if (body.type === 'circle') {
    if (body.centerLat == null || body.centerLng == null || body.radiusMeters == null) {
      return json(
        { message: 'circle geofence requires centerLat, centerLng, and radiusMeters' },
        400,
      );
    }
  }

  if (body.type === 'polygon') {
    if (!Array.isArray(body.polygon) || body.polygon.length < 3) {
      return json({ message: 'polygon geofence requires at least 3 points' }, 400);
    }
  }

  try {
    const { getAdminClient } = await import('../../../../../shared/auth');
    const supabase = getAdminClient(context.env);

    // Fetch current settings from organisation
    const { data: org, error: orgError } = await supabase
      .from('Organization')
      .select('id, settings')
      .eq('id', orgId)
      .maybeSingle();

    if (orgError || !org) {
      return json({ message: 'Organization not found' }, 404);
    }

    const settings = ((org.settings ?? {}) as Record<string, unknown>);
    const existing = Array.isArray(settings.geofences)
      ? (settings.geofences as unknown[])
      : [];

    const newGeofence = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      type: body.type,
      centerLat: body.centerLat,
      centerLng: body.centerLng,
      radiusMeters: body.radiusMeters,
      polygon: body.polygon,
      active: body.active !== false,
    };

    const updatedSettings = { ...settings, geofences: [...existing, newGeofence] };

    const { error: updateError } = await supabase
      .from('Organization')
      .update({ settings: updatedSettings, updatedAt: new Date().toISOString() })
      .eq('id', orgId);

    if (updateError) {
      console.error('[fleet/geofences] update error:', updateError.message);
      return json({ message: 'Failed to create geofence' }, 500);
    }

    return json({ geofence: newGeofence }, 201);
  } catch (err) {
    console.error('[fleet/geofences] error:', (err as Error).message);
    return json({ message: 'Internal server error' }, 500);
  }
};
