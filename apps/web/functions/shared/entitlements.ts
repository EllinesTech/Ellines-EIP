/**
 * Ellines EIP — Organisation entitlement resolver (TASK-05)
 *
 * Single authoritative function for resolving what a client organisation is
 * allowed to do based on its assigned service package (rate_limit_tiers) and
 * any per-org override stored in organization_tiers.custom_limits.
 *
 * Usage:
 *   const entitlement = await getOrgEntitlement(supabase, organizationId);
 *   if (!entitlement.enableSso) return json({ statusCode: 422, message: 'SSO not included in your plan' }, 422);
 *
 * Rules:
 *   - custom_limits overrides package defaults (allows per-org exceptions without
 *     creating a new package tier).
 *   - If the org has no organization_tiers row, all numeric limits are null
 *     (= unlimited) and all feature flags are false (= disabled). This is
 *     intentionally conservative: an unpackaged org can read but cannot unlock
 *     premium features.
 *   - null for a numeric limit means "no limit" (unlimited).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrgEntitlement {
  /** Maximum connector installations allowed. null = unlimited. */
  maxConnectors: number | null;
  /** Maximum active org members allowed. null = unlimited. */
  maxUsers: number | null;
  /** Maximum data export bytes per day. null = unlimited. */
  maxDataExportPerDay: number | null;
  /** Whether SSO providers can be created. */
  enableSso: boolean;
  /** Whether custom roles can be created. */
  enableCustomRoles: boolean;
  /** Whether Ellinea agents can be created. */
  enableAgents: boolean;
  /** Whether advanced BI / dashboards are unlocked. */
  enableAdvancedBi: boolean;
  /** Whether webhook endpoints can be configured. */
  enableWebhooks: boolean;
}

/** Default entitlement for orgs with no package assigned — conservative. */
const DEFAULT_ENTITLEMENT: OrgEntitlement = {
  maxConnectors: null,
  maxUsers: null,
  maxDataExportPerDay: null,
  enableSso: false,
  enableCustomRoles: false,
  enableAgents: false,
  enableAdvancedBi: false,
  enableWebhooks: false,
};

/**
 * Resolve the effective entitlement for an organisation.
 *
 * @param supabase       Admin Supabase client.
 * @param organizationId UUID of the organisation to resolve.
 */
export async function getOrgEntitlement(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrgEntitlement> {
  const { data } = await supabase
    .from('organization_tiers')
    .select(
      'custom_limits, rate_limit_tiers(max_connectors, max_users, max_data_export_per_day, enable_sso, enable_custom_roles, enable_agents, enable_advanced_bi, enable_webhooks)',
    )
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!data) {
    // No package assigned — return conservative defaults
    return { ...DEFAULT_ENTITLEMENT };
  }

  const tierRaw = data.rate_limit_tiers;
  const pkg = (Array.isArray(tierRaw) ? (tierRaw[0] ?? {}) : (tierRaw ?? {})) as Record<string, unknown>;
  const custom = ((data.custom_limits ?? {}) as Record<string, unknown>);

  /** Pick from custom_limits first, then package, then fallback. */
  function pick<T>(key: string, fallback: T): T {
    if (key in custom && custom[key] !== undefined && custom[key] !== null) {
      return custom[key] as T;
    }
    if (key in pkg && pkg[key] !== undefined && pkg[key] !== null) {
      return pkg[key] as T;
    }
    return fallback;
  }

  return {
    maxConnectors:       pick<number | null>('max_connectors',        null),
    maxUsers:            pick<number | null>('max_users',             null),
    maxDataExportPerDay: pick<number | null>('max_data_export_per_day', null),
    enableSso:           Boolean(pick<unknown>('enable_sso',           false)),
    enableCustomRoles:   Boolean(pick<unknown>('enable_custom_roles',  false)),
    enableAgents:        Boolean(pick<unknown>('enable_agents',        false)),
    enableAdvancedBi:    Boolean(pick<unknown>('enable_advanced_bi',   false)),
    enableWebhooks:      Boolean(pick<unknown>('enable_webhooks',      false)),
  };
}

/** Helper: return a 422 Response when an entitlement is exceeded. */
export function entitlementError(
  feature: string,
  detail?: string,
): Response {
  const message = detail
    ? `${feature} is not included in your plan. ${detail}`
    : `${feature} is not included in your plan. Contact Ellines to upgrade.`;
  return new Response(
    JSON.stringify({ statusCode: 422, message }),
    { status: 422, headers: { 'Content-Type': 'application/json' } },
  );
}
