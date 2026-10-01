/**
 * Authoritative source counts for one organisation.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dashboard banner used to read `enterprise_snapshots.connected_systems`,
 * which the sync writers filled with the number of CONNECTOR INSTALLATIONS.
 * A connector is the mechanism ("how does EIP reach the source?"), not the
 * thing ("what is actually connected?"), so an organisation whose only source
 * is a WEBSITE - served by one API connector - was reported as having one
 * connected business system. That is the "1 system connected" bug.
 *
 * The counts are read from the classification the organisation actually
 * persisted, which is the only thing that can answer "what is connected?":
 *
 *   websites        organization_sources WHERE source_type = 'WEBSITE'
 *   businessSystems organization_sources WHERE source_type = 'BUSINESS_SYSTEM'
 *   connectors      connector_installations (technical inventory, independent)
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It never infers classification from a connector catalog id, a URL, a URL path,
 * an HTTP status, a response shape, an organisation name or a connector name.
 * It never applies a floor of 1, so "no business system" is reported as 0.
 * Every query is scoped to one organisation, so one tenant can never see
 * another's counts.
 */
import { countSourcesByType } from '@ellines-eip/shared';
import { getAdminClient } from './auth';

export interface AuthoritativeSourceCounts {
  websites: number;
  businessSystems: number;
  connectors: number;
}

/** All counts are zero - an organisation with no source rows at all. */
export function emptySourceCounts(): AuthoritativeSourceCounts {
  return { websites: 0, businessSystems: 0, connectors: 0 };
}

type Supabase = ReturnType<typeof getAdminClient>;

/**
 * Read the three counts for ONE organisation.
 *
 * `organizationId` is applied as an equality filter on every query, so this is
 * safe to call from a platform-scoped endpoint as well as an org-scoped one:
 * the caller chooses WHICH organisation, never which organisations.
 *
 * A read failure resolves to all-zero counts rather than throwing. A count is
 * a dashboard fact, and failing an entire summary because one count could not
 * be read would replace an honest 0 with a broken page. The snapshot's own
 * health and alert fields are unaffected either way.
 */
export async function readAuthoritativeSourceCounts(
  supabase: Supabase,
  organizationId: string,
): Promise<AuthoritativeSourceCounts> {
  if (!organizationId) return emptySourceCounts();

  const [sourcesResult, connectorsResult] = await Promise.all([
    supabase
      .from('organization_sources')
      .select('source_type')
      .eq('organization_id', organizationId),
    supabase
      .from('connector_installations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .neq('status', 'deleted'),
  ]);

  // The classification count comes from persisted `source_type` values only.
  // Built with an explicit loop and an explicitly typed array so the two
  // classifications stay one union instead of inferring as incompatible types.
  const classifiedSources: Array<{ sourceType: 'WEBSITE' | 'BUSINESS_SYSTEM' }> = [];
  for (const raw of Array.isArray(sourcesResult.data) ? sourcesResult.data : []) {
    const sourceType = (raw as { source_type?: unknown }).source_type;
    // An unrecognised value is neither a website nor a business system. The
    // CHECK constraint means this cannot happen in practice, and inventing a
    // category here is precisely what this module exists to prevent.
    if (sourceType === 'WEBSITE' || sourceType === 'BUSINESS_SYSTEM') {
      classifiedSources.push({ sourceType });
    }
  }

  const classified = countSourcesByType(classifiedSources);

  return {
    websites: classified.websites,
    businessSystems: classified.businessSystems,
    // Independent of the source counts: a connector is inventory, and counting
    // it here never changes how many websites or systems the org has.
    connectors: connectorsResult.count ?? 0,
  };
}