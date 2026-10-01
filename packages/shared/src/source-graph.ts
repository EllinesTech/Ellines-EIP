/**
 * Source graph: Organisation --- Source --- Connector --- Resource.
 *
 * THE SEPARATION THIS EXISTS TO ENFORCE
 * --------------------------------------
 * A connector is the MECHANISM ("how does EIP reach the source?"). A source is
 * the THING ("what is actually connected?"). The dashboards used to render the
 * connector as the headline concept, so an organisation with one working
 * integration was described as "Connectors: 1" --- which tells a client nothing
 * about whether their business is connected, and tells a Super Admin nothing at
 * all about the organisation behind it.
 *
 *   WEBSITE          the org's own site. Technical measurements only.
 *   BUSINESS_SYSTEM  a real system reached through one or more connectors,
 *                    exposing however many resources it actually exposes.
 *
 * ONE CONNECTOR --- MANY RESOURCES is preserved end to end: a system groups every
 * connector that reaches it, and every resource discovered through any of them.
 * EIP never requires one connector per business module.
 *
 * WHAT THIS MODULE WILL NOT DO
 * ----------------------------
 * It never invents a source, a resource, a record count or a status. Everything
 * it returns traces to a row that already exists or to a retrieval that actually
 * happened. Where a fact is not measured it is `null` with an explicit state,
 * never 0 and never a healthy default.
 */

import {
  availableCapabilityCount,
  type CapabilityAvailability,
  type CapabilityRegistry,
  type DiscoveredResource,
} from './capability-registry';
import { toInstantMs, toUtcIso } from './db-time';

/** What kind of thing the organisation is connected to. */
export type SourceType = 'WEBSITE' | 'BUSINESS_SYSTEM';

/**
 * How fresh a measurement or retrieval is.
 * `UNKNOWN` exists so "never checked" is representable without lying.
 */
export type FreshnessState = 'FRESH' | 'STALE' | 'UNKNOWN';

/** A stored source row. */
export interface SourceRow {
  id: string;
  organizationId: string;
  sourceType: SourceType;
  name: string;
  /** NULL = the organisation has not configured a website. */
  websiteUrl: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** A stored connector installation row (the subset the graph needs). */
export interface ConnectorRow {
  id: string;
  organizationId: string;
  displayName: string;
  catalogId: string;
  status: string;
  config?: Record<string, unknown> | null;
  lastSyncedAt?: string | null;
  lastSyncAt?: string | null;
  lastTestAt?: string | null;
  lastMessage?: string | null;
  lastError?: string | null;
  errorCount?: number | null;
  lifecycleState?: string | null;
  syncIntervalSeconds?: number | null;
}

/** The newest real website probe for a source, if one was ever taken. */
export interface WebsiteMeasurementRow {
  sourceId: string;
  checkedAt: string;
  outcome: 'ONLINE' | 'OFFLINE' | 'DNS_FAILURE' | 'TLS_FAILURE' | 'TIMEOUT' | 'NOT_CHECKED';
  httpStatus: number | null;
  responseTimeMs: number | null;
  redirected: boolean | null;
  finalUrl: string | null;
  tlsValid: boolean | null;
  tlsIssuer: string | null;
  tlsSubject: string | null;
  tlsValidTo: string | null;
  message: string | null;
}

/** A capability registry as persisted for one connector. */
export interface RegistryRow {
  installationId: string;
  registry: CapabilityRegistry;
  discoveredAt?: string | null;
}

/** A real resource the source actually exposed, with retrieval evidence. */
export interface SourceResourceView {
  /** The source's own resource name, e.g. `books`. Never an EIP invention. */
  id: string;
  label: string;
  path: string;
  availability: CapabilityAvailability;
  /** Why it is not AVAILABLE. Present only when availability is not AVAILABLE. */
  reason: string | null;
  /** null when EIP has never read this resource. */
  retrievedRecordCount: number | null;
  /** null when the source published no total. */
  reportedRecordCount: number | null;
  /** null when completeness was never determined. */
  complete: boolean | null;
  lastRetrievedAt: string | null;
  /** Which connector read this resource. One connector can read many. */
  connectorId: string;
  connectorName: string;
}

/** Freshness of a connector's last successful retrieval. */
export interface SourceFreshness {
  lastSuccessfulSyncAt: string | null;
  ageMinutes: number | null;
  syncIntervalMinutes: number | null;
  state: FreshnessState;
}

/** A technical connector as the Super Admin inventory sees it. */
export interface ConnectorView {
  id: string;
  name: string;
  type: string;
  status: string;
  lifecycleState: string | null;
  /** The source this connector serves. Never the connector standing in for it. */
  sourceId: string | null;
  sourceName: string | null;
  sourceType: SourceType | null;
  authentication: {
    authType: string;
    /** True when the connector stores a credential. Says nothing about validity. */
    hasCredential: boolean;
    /** Last real test/sync result, or null when never tested. */
    lastTestAt: string | null;
  };
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  /** The connector's own last status message, verbatim. */
  lastMessage: string | null;
  lastError: string | null;
  errorCount: number;
  freshness: SourceFreshness;
  resources: SourceResourceView[];
}

/** A connected website, with only genuinely measured facts. */
export interface WebsiteView {
  id: string;
  name: string;
  url: string;
  /** The real probe outcome, or null when the site was never checked. */
  outcome: WebsiteMeasurementRow['outcome'] | null;
  /** null = no response was received. Never 0. */
  httpStatus: number | null;
  /** null = no request completed. Never 0. */
  responseTimeMs: number | null;
  redirected: boolean | null;
  finalUrl: string | null;
  tls: {
    /** null = TLS was not measurable (plain HTTP, or the probe failed). */
    valid: boolean | null;
    issuer: string | null;
    subject: string | null;
    validTo: string | null;
  };
  lastCheckedAt: string | null;
  freshness: SourceFreshness;
  message: string | null;
}

/** A connected business system and everything actually reachable through it. */
export interface BusinessSystemView {
  id: string;
  name: string;
  description: string | null;
  status: 'CONNECTED' | 'NOT_CONNECTED';
  /**
   * `CONNECTED` requires evidence of a real retrieval, never merely a connector
   * row existing. A configured-but-never-synced system is NOT_CONNECTED.
   */
  statusEvidence: string;
  connectorIds: string[];
  connectors: ConnectorView[];
  resources: SourceResourceView[];
  /** null when no resource has ever been read. */
  availableResourceCount: number | null;
  totalResourceCount: number | null;
  lastSuccessfulRetrievalAt: string | null;
  freshness: SourceFreshness;
  /**
   * null = completeness was never determined. A partial read is PARTIAL, and a
   * source that was never read is UNKNOWN --- never 0 and never "complete".
   */
  completeness: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | null;
  errors: string[];
}

/** The full picture for one organisation. */
export interface OrganizationSourceGraph {
  organizationId: string;
  organizationName: string | null;
  /** The website row, or null when the org has not configured one. */
  website: WebsiteView | null;
  businessSystems: BusinessSystemView[];
  /** The technical inventory, kept separate from the systems it serves. */
  connectors: ConnectorView[];
  /** Counts are of real rows only. */
  counts: {
    websites: number;
    businessSystems: number;
    connectors: number;
    discoveredResources: number;
    availableResources: number | null;
  };
}

/** Default freshness window when a connector declares no interval. */
const DEFAULT_FRESHNESS_MINUTES = 60;

/**
 * Age --- freshness state.
 *
 * No timestamp means UNKNOWN, not FRESH and not STALE. A source that has never
 * been read has no freshness to report, and saying otherwise is the specific
 * failure this replaces.
 */
export function freshnessFrom(
  lastSuccessfulSyncAt: string | null | undefined,
  syncIntervalMinutes: number | null | undefined,
  now: number = Date.now(),
): SourceFreshness {
  const interval =
    typeof syncIntervalMinutes === 'number' && syncIntervalMinutes > 0
      ? syncIntervalMinutes
      : DEFAULT_FRESHNESS_MINUTES;

  if (!lastSuccessfulSyncAt) {
    return {
      lastSuccessfulSyncAt: null,
      ageMinutes: null,
      syncIntervalMinutes: interval,
      state: 'UNKNOWN',
    };
  }

  // Stored timestamps come back from PostgREST without a zone (see db-time.ts).
  // Parsing them as local time made a just-completed sync read as hours old.
  const storedMs = toInstantMs(lastSuccessfulSyncAt);
  if (storedMs === null) {
    return {
      lastSuccessfulSyncAt: null,
      ageMinutes: null,
      syncIntervalMinutes: interval,
      state: 'UNKNOWN',
    };
  }

  const ageMinutes = Math.floor((now - storedMs) / 60000);
  return {
    // Emitted as explicit UTC so no consumer has to guess the zone again.
    lastSuccessfulSyncAt: toUtcIso(lastSuccessfulSyncAt),
    ageMinutes,
    syncIntervalMinutes: interval,
    state: ageMinutes > interval * 2 ? 'STALE' : 'FRESH',
  };
}

/**
 * The sync interval the CONNECTOR actually stores.
 *
 * The configured `syncIntervalMinutes` is preferred over the
 * `sync_interval_seconds` column, which is frequently left at its 3600 default
 * while the connector is configured differently --- judging freshness against an
 * interval the operator never chose is how a 15-minute connector read as STALE.
 */
export function effectiveSyncIntervalMinutes(c: ConnectorRow): number | null {
  const cfg = c.config ?? {};
  const configured = Number(cfg.syncIntervalMinutes);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const column = Number(c.syncIntervalSeconds);
  if (Number.isFinite(column) && column > 0) return Math.round(column / 60);
  return null;
}

/** True when the connector stores any credential. Validity is not implied. */
function hasCredential(cfg: Record<string, unknown> | null | undefined): boolean {
  if (!cfg) return false;
  return [
    'apiKey',
    'bearerToken',
    'basicPass',
    'connectionString',
    'imapPassword',
    'sftpPassword',
    'sftpPrivateKey',
  ].some((k) => {
    const v = cfg[k];
    return typeof v === 'string' && v.length > 0 && v !== '***';
  });
}

/** Project a discovered resource plus its retrieval evidence into a view. */
function resourceView(r: DiscoveredResource, connector: ConnectorRow): SourceResourceView {
  return {
    id: r.id,
    label: r.label,
    path: r.path,
    availability: r.availability,
    reason: r.reason ?? null,
    // Never defaulted to 0: an un-retrieved resource has an unknown count.
    retrievedRecordCount: r.retrievedRecordCount ?? null,
    reportedRecordCount: r.reportedRecordCount ?? null,
    complete: r.complete ?? null,
    lastRetrievedAt: r.lastRetrievedAt ?? null,
    connectorId: connector.id,
    connectorName: connector.displayName,
  };
}

/**
 * Assemble the whole graph from real rows.
 *
 * Pure and total: given the rows it is handed, it produces the dashboards'
 * entire view. It performs no I/O, so it cannot "invent" a measurement, and it
 * has no fallback values to leak when a fact is absent.
 */
export function buildSourceGraph(input: {
  organizationId: string;
  organizationName?: string | null;
  sources: SourceRow[];
  connectors: ConnectorRow[];
  registries: RegistryRow[];
  measurements: WebsiteMeasurementRow[];
  now?: number;
}): OrganizationSourceGraph {
  const now = input.now ?? Date.now();

  /** Which source a connector belongs to. Backfilled sources record the id in metadata. */
  const sourceIdForConnector = (connectorId: string): string | null => {
    const match = input.sources.find(
      (s) => (s.metadata as { connectorId?: string } | null)?.connectorId === connectorId,
    );
    return match?.id ?? null;
  };

  const registryFor = (installationId: string): RegistryRow | undefined =>
    input.registries.find((r) => r.installationId === installationId);

  // ------ Connectors ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const connectorViews: ConnectorView[] = input.connectors.map((c) => {
    const reg = registryFor(c.id);
    const freshness = freshnessFrom(c.lastSyncAt ?? c.lastSyncedAt, effectiveSyncIntervalMinutes(c), now);
    const sourceId = sourceIdForConnector(c.id);
    const source = input.sources.find((s) => s.id === sourceId) ?? null;
    const cfg = c.config ?? {};

    // No registry means "not discovered yet" --- reported as an empty list plus
    // that fact, never as a system with no capabilities.
    const resources: SourceResourceView[] = reg
      ? reg.registry.resources.map((r) => resourceView(r, c))
      : [];

    return {
      id: c.id,
      name: c.displayName,
      type: c.catalogId,
      status: c.status,
      lifecycleState: c.lifecycleState ?? null,
      sourceId,
      sourceName: source?.name ?? null,
      sourceType: source?.sourceType ?? null,
      authentication: {
        authType: String(cfg.authType ?? 'none'),
        hasCredential: hasCredential(cfg),
        lastTestAt: c.lastTestAt ?? null,
      },
      lastSuccessfulSyncAt: freshness.lastSuccessfulSyncAt,
      lastAttemptAt: c.lastSyncedAt ?? null,
      lastMessage: c.lastMessage ?? null,
      lastError: c.lastError ?? null,
      errorCount: Number(c.errorCount ?? 0),
      freshness,
      resources,
    };
  });

  // ------ Website ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const websiteRow = input.sources.find((s) => s.sourceType === 'WEBSITE') ?? null;
  let website: WebsiteView | null = null;
  if (websiteRow?.websiteUrl) {
    const m = input.measurements
      .filter((x) => x.sourceId === websiteRow.id)
      .sort((a, b) => (toInstantMs(b.checkedAt) ?? 0) - (toInstantMs(a.checkedAt) ?? 0))[0];
    website = {
      id: websiteRow.id,
      name: websiteRow.name,
      url: websiteRow.websiteUrl,
      // No measurement --- null outcome, and the UI must render NOT_CHECKED.
      outcome: m?.outcome ?? null,
      httpStatus: m?.httpStatus ?? null,
      responseTimeMs: m?.responseTimeMs ?? null,
      redirected: m?.redirected ?? null,
      finalUrl: m?.finalUrl ?? null,
      tls: {
        valid: m?.tlsValid ?? null,
        issuer: m?.tlsIssuer ?? null,
        subject: m?.tlsSubject ?? null,
        validTo: m?.tlsValidTo ?? null,
      },
      lastCheckedAt: m?.checkedAt ?? null,
      freshness: freshnessFrom(m?.checkedAt ?? null, null, now),
      message: m?.message ?? null,
    };
  }

  // ------ Business systems ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const systemRows = input.sources.filter((s) => s.sourceType === 'BUSINESS_SYSTEM');

  const summarise = (serving: ConnectorView[]) => {
    const resources = serving.flatMap((c) => c.resources);
    // Newest retrieval across every resource any of these connectors read.
    // Compared as instants, not as strings: stored timestamps can carry a zone
    // (`...Z`) or not, and lexicographic sorting of mixed forms is wrong.
    const retrievalInstants = resources
      .map((r) => toInstantMs(r.lastRetrievedAt))
      .filter((ms): ms is number => ms !== null);
    const lastRetrieval =
      retrievalInstants.length > 0
        ? new Date(Math.max(...retrievalInstants)).toISOString()
        : null;

    const errors: string[] = [];
    for (const c of serving) if (c.lastError) errors.push(`${c.name}: ${c.lastError}`);
    for (const r of resources) {
      if (r.availability !== 'AVAILABLE' && r.reason) errors.push(`${r.label}: ${r.reason}`);
    }

    // COMPLETE only when every discovered resource was genuinely read.
    // null when nothing has been read, and never derived from a connector row.
    let completeness: BusinessSystemView['completeness'] = null;
    if (resources.length > 0) {
      completeness = resources.every((r) => r.availability === 'AVAILABLE') ? 'COMPLETE' : 'PARTIAL';
    }

    const available = resources.filter((r) => r.availability === 'AVAILABLE');
    return {
      resources,
      lastRetrieval,
      errors,
      completeness,
      available,
      status: (available.length > 0 ? 'CONNECTED' : 'NOT_CONNECTED') as BusinessSystemView['status'],
      statusEvidence:
        available.length > 0
          ? `${available.length} of ${resources.length} discovered resource(s) were read successfully.`
          : resources.length > 0
            ? 'A connector is configured but no resource has been read successfully yet.'
            : 'A connector is configured but its capabilities have not been discovered yet.',
    };
  };

  const businessSystems: BusinessSystemView[] = systemRows.map((s) => {
    const serving = connectorViews.filter((c) => c.sourceId === s.id);
    const sum = summarise(serving);
    return {
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      status: sum.status,
      statusEvidence: sum.statusEvidence,
      connectorIds: serving.map((c) => c.id),
      connectors: serving,
      resources: sum.resources,
      // null when nothing was discovered, so "no resources" is never read as 0 available.
      availableResourceCount: sum.resources.length ? sum.available.length : null,
      totalResourceCount: sum.resources.length ? sum.resources.length : null,
      lastSuccessfulRetrievalAt: sum.lastRetrieval,
      freshness: freshnessFrom(sum.lastRetrieval, null, now),
      completeness: sum.completeness,
      errors: sum.errors,
    };
  });

  // Connectors with no owning source row would otherwise vanish from the
  // inventory. They are surfaced as their own unassigned systems so the Super
  // Admin can see them, rather than being silently hidden.
  const assigned = new Set(businessSystems.flatMap((s) => s.connectorIds));
  for (const c of connectorViews) {
    if (assigned.has(c.id)) continue;
    const sum = summarise([c]);
    businessSystems.push({
      id: `unassigned:${c.id}`,
      name: c.name,
      description: c.lastMessage ?? null,
      status: sum.status,
      statusEvidence: sum.statusEvidence,
      connectorIds: [c.id],
      connectors: [c],
      resources: sum.resources,
      availableResourceCount: sum.resources.length ? sum.available.length : null,
      totalResourceCount: sum.resources.length ? sum.resources.length : null,
      lastSuccessfulRetrievalAt: sum.lastRetrieval,
      freshness: c.freshness,
      completeness: sum.completeness,
      errors: sum.errors,
    });
  }

  const allResources = connectorViews.flatMap((c) => c.resources);

  return {
    organizationId: input.organizationId,
    organizationName: input.organizationName ?? null,
    website,
    businessSystems,
    connectors: connectorViews,
    counts: {
      websites: website ? 1 : 0,
      businessSystems: businessSystems.length,
      connectors: connectorViews.length,
      discoveredResources: allResources.length,
      // null when nothing was discovered, never 0-by-default.
      availableResources: allResources.length
        ? allResources.filter((r) => r.availability === 'AVAILABLE').length
        : null,
    },
  };
}

/** Re-exported so callers do not need a second import for the count helper. */
export { availableCapabilityCount };
