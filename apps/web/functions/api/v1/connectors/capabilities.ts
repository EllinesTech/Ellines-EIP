/**
 * GET /api/v1/connectors/capabilities
 *
 * The client capability view (spec §14, §16, §18): what each connected system
 * ACTUALLY exposes, and for each capability whether EIP can read it yet.
 *
 * Tenant isolation: every row is filtered by the caller's organization, and a
 * platform admin may target one explicitly. No cross-tenant aggregation, and
 * no fallback organization.
 *
 * Absence of a registry means "not discovered yet", which is reported as such.
 * It is never rendered as "this system has no capabilities".
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { availableCapabilityCount, groupByDomain } from '@ellines-eip/shared';
import { platformStaffHas } from '../../../shared/platform-staff';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  // A platform admin may inspect a specific org; everyone else is pinned to
  // their own. This is the same rule the other connector routes use.
  let organizationId = auth.organizationId;
  if (await platformStaffHas(context.env, auth.email, 'platform.connectors.manage')) {
    const requested = new URL(context.request.url).searchParams.get('orgId');
    if (requested) organizationId = requested;
  }

  const { data: installations, error: instErr } = await supabase
    .from('connector_installations')
    .select('id, display_name, catalog_id, status, last_sync_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (instErr) return json({ statusCode: 500, message: instErr.message }, 500);

  const ids = (installations ?? []).map((i) => i.id as string);
  const { data: registries, error: regErr } = ids.length
    ? await supabase
        .from('connector_capability_registries')
        .select('installation_id, available_count, unavailable_count, registry, discovered_at')
        .in('installation_id', ids)
        .eq('organization_id', organizationId)
    : { data: [], error: null };

  if (regErr) return json({ statusCode: 500, message: regErr.message }, 500);

  const byInstallation = new Map(
    (registries ?? []).map((r) => [r.installation_id as string, r]),
  );

  const systems = (installations ?? []).map((i) => {
    const reg = byInstallation.get(i.id as string);
    const registry = (reg?.registry ?? null) as Parameters<typeof groupByDomain>[0] | null;
    return {
      installationId: i.id as string,
      displayName: (i.display_name as string) || (i.catalog_id as string),
      catalogId: i.catalog_id as string,
      status: i.status as string,
      lastSyncedAt: (i.last_sync_at as string | null) ?? null,
      // Explicit discovery state, so the client can say "not discovered yet"
      // instead of implying the system is empty.
      discovered: Boolean(registry),
      discoveredAt: (reg?.discovered_at as string | null) ?? null,
      availableCount: registry ? availableCapabilityCount(registry) : 0,
      totalCount: registry ? registry.resources.length : 0,
      domains: registry ? groupByDomain(registry) : {},
    };
  });

  return json({
    organizationId,
    systems,
    // A system with no registry is un-discovered, not empty. The client shows
    // "sync or connect to discover capabilities" rather than "no capabilities".
    undiscoveredCount: systems.filter((s) => !s.discovered).length,
  });
};
