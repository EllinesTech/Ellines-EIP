'use client';

/**
 * Shared presentation for the source graph.
 *
 * Every component here renders only what the API returned. When a value was
 * never measured it renders UNKNOWN or an explicit state — never 0, never
 * "healthy", never a plausible-looking placeholder. The anti-fabrication rules
 * live in the API layer; these components exist so a missing value cannot be
 * accidentally rendered as a real one on the way to the screen.
 */

import type {
  CapabilityAvailabilityDto,
  SourceConnectorDto,
  SourceResourceDto,
  SourceWebsiteDto,
} from '@/lib/api';
import styles from './source-modules.module.css';

/** A possibly-unmeasured value. Renders UNKNOWN, never 0. */
export function Measured({
  value,
  unit,
  unknownLabel = 'UNKNOWN',
}: {
  value: number | string | null | undefined;
  unit?: string;
  unknownLabel?: string;
}) {
  if (value === null || value === undefined || value === '') {
    return <span className={styles.unknown}>{unknownLabel}</span>;
  }
  return (
    <span className={styles.measured}>
      {value}
      {unit ? <span className={styles.unit}>{unit}</span> : null}
    </span>
  );
}

/**
 * Availability tone. The mapping is explicit rather than derived from a number,
 * so a state like NOT_AUTHORIZED can never be painted as a soft warning that
 * reads like success.
 */
export function availabilityTone(a: CapabilityAvailabilityDto): string {
  switch (a) {
    case 'AVAILABLE':
      return styles.toneOk;
    case 'PARTIAL':
      return styles.toneWarn;
    case 'NOT_AUTHORIZED':
    case 'UNAVAILABLE':
      return styles.toneBad;
    case 'NOT_YET_SUPPORTED':
      return styles.toneInfo;
    case 'NOT_PROVIDED_BY_SOURCE':
    default:
      return styles.toneMuted;
  }
}

export function AvailabilityBadge({ availability }: { availability: CapabilityAvailabilityDto }) {
  return (
    <span className={`${styles.badge} ${availabilityTone(availability)}`}>
      {availability.replace(/_/g, ' ')}
    </span>
  );
}

export function FreshnessTag({ state }: { state: 'FRESH' | 'STALE' | 'UNKNOWN' }) {
  const tone =
    state === 'FRESH' ? styles.toneOk : state === 'STALE' ? styles.toneWarn : styles.toneUnknown;
  return <span className={`${styles.badge} ${tone}`}>{state}</span>;
}

/** One discovered resource and the real retrieval evidence behind it. */
export function ResourceRow({ resource }: { resource: SourceResourceDto }) {
  return (
    <tr>
      <td>
        <div className={styles.resourceName}>{resource.label}</div>
        <div className={styles.resourcePath}>{resource.path}</div>
      </td>
      <td>
        <AvailabilityBadge availability={resource.availability} />
        {resource.reason ? <div className={styles.reason}>{resource.reason}</div> : null}
      </td>
      <td>
        {/* The count EIP actually retrieved. Unknown until a read happens. */}
        <Measured value={resource.retrievedRecordCount} />
      </td>
      <td>
        {/* What the SOURCE claimed. Distinct from the count above. */}
        <Measured value={resource.reportedRecordCount} />
      </td>
      <td>
        <Measured
          value={resource.lastRetrievedAt ? new Date(resource.lastRetrievedAt).toLocaleString() : null}
          unknownLabel="NEVER RETRIEVED"
        />
      </td>
      <td>
        <span className={styles.muted}>{resource.connectorName}</span>
      </td>
    </tr>
  );
}


/**
 * The technical inventory row.
 *
 * A connector is shown as a MECHANISM: what it is, what it authenticates with,
 * when it last succeeded, and what it has actually read. It is never presented
 * as the connected system itself.
 */
export function ConnectorRowView({ connector }: { connector: SourceConnectorDto }) {
  return (
    <tr>
      <td>
        <div className={styles.resourceName}>{connector.name}</div>
        <div className={styles.resourcePath}>{connector.type}</div>
      </td>
      <td>
        <span className={styles.muted}>{connector.sourceName ?? 'Unassigned source'}</span>
      </td>
      <td>
        <span className={styles.muted}>
          {connector.authentication.authType}
          {connector.authentication.hasCredential ? ' (credential stored)' : ' (no credential)'}
        </span>
      </td>
      <td>
        <span className={styles.muted}>{connector.status}</span>
      </td>
      <td>
        <Measured
          value={
            connector.lastSuccessfulSyncAt
              ? new Date(connector.lastSuccessfulSyncAt).toLocaleString()
              : null
          }
          unknownLabel="NEVER SYNCED"
        />
      </td>
      <td>
        <FreshnessTag state={connector.freshness.state} />
      </td>
      <td>
        {connector.resources.length ? (
          <span className={styles.muted}>
            {connector.resources.filter((r) => r.availability === 'AVAILABLE').length} of{' '}
            {connector.resources.length} readable
          </span>
        ) : (
          <span className={styles.unknown}>NOT DISCOVERED</span>
        )}
      </td>
      <td>
        {connector.lastError ? (
          <span className={styles.errorText}>{connector.lastError}</span>
        ) : (
          <span className={styles.muted}>-</span>
        )}
      </td>
    </tr>
  );
}

export function ConnectorTable({ connectors }: { connectors: SourceConnectorDto[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Connector</th>
            <th>Serves source</th>
            <th>Authentication</th>
            <th>Status</th>
            <th>Last successful sync</th>
            <th>Freshness</th>
            <th>Capabilities</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {connectors.map((c) => (
            <ConnectorRowView key={c.id} connector={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A compact website summary for dashboards that need one row, not a page. */
export function WebsiteSummaryCard({ website }: { website: SourceWebsiteDto | null }) {
  if (!website) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Connected Website</h3>
          <span className={`${styles.badge} ${styles.toneUnknown}`}>NOT CONNECTED</span>
        </div>
        <p className={styles.body}>
          No website is configured for this organisation, so EIP has no site to measure. EIP does
          not substitute another website and does not report a status it has no evidence for.
        </p>
      </div>
    );
  }

  const tone =
    website.outcome === 'ONLINE'
      ? styles.toneOk
      : website.outcome === null || website.outcome === 'NOT_CHECKED'
        ? styles.toneUnknown
        : styles.toneBad;
  const outcomeText = website.outcome === null ? 'NOT CHECKED' : website.outcome.replace(/_/g, ' ');

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>Connected Website</h3>
          <div className={styles.url}>{website.url}</div>
        </div>
        <span className={`${styles.badge} ${tone}`}>{outcomeText}</span>
      </div>
      <dl className={styles.grid}>
        <div className={styles.cell}>
          <dt className={styles.label}>HTTP</dt>
          <dd className={styles.value}>
            <Measured value={website.httpStatus} />
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>Response</dt>
          <dd className={styles.value}>
            <Measured value={website.responseTimeMs} unit="ms" />
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>TLS</dt>
          <dd className={styles.value}>
            {website.tls.valid === null ? (
              <span className={styles.unknown}>UNKNOWN</span>
            ) : website.tls.valid ? (
              <span className={`${styles.badge} ${styles.toneOk}`}>VALID</span>
            ) : (
              <span className={`${styles.badge} ${styles.toneBad}`}>INVALID</span>
            )}
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>Last checked</dt>
          <dd className={styles.value}>
            {website.lastCheckedAt ? (
              new Date(website.lastCheckedAt).toLocaleString()
            ) : (
              <span className={styles.unknown}>NEVER CHECKED</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ResourceTable({ resources }: { resources: SourceResourceDto[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Availability</th>
            <th>Records retrieved</th>
            <th>Reported by source</th>
            <th>Last retrieved</th>
            <th>Read via</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <ResourceRow key={`${r.connectorId}:${r.id}`} resource={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
