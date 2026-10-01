'use client';

/**
 * OrgSourceOverview — the Super Admin's view of what a client is actually
 * connected to.
 *
 * It exists because "Connectors: 1" answers only "how is EIP connected?", which
 * is not the question an operator has about a client. The question is:
 *
 *     Which organisation is this, is their website up, which business systems
 *     are they running, what does each one actually expose, and which connector
 *     reads it?
 *
 * So this renders the whole chain, in that order, from the same endpoint the
 * client's own Command Center uses. There is no second data source, and no
 * value here is inferred from a connector count.
 *
 * Anti-fabrication rules that are structural, not cosmetic:
 *   - No website configured -> an explicit NOT CONFIGURED state.
 *   - No business system     -> an explicit NOT CONNECTED state.
 *   - A capability is listed only when the real source returned it.
 *   - Unmeasured values render UNKNOWN, never 0 and never a healthy default.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { fetchOrganizationSources, type OrganizationSourceGraphDto } from '@/lib/api';
import { AvailabilityBadge, ConnectorTable, FreshnessTag, Measured } from './SourceModules';
import styles from './source-modules.module.css';

/** A labelled measurement cell. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.cell}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

/** The website block, or an explicit not-configured state. */
function WebsiteBlock({ website }: { website: OrganizationSourceGraphDto['website'] }) {
  if (!website) {
    return (
      <p className={styles.body} style={{ marginTop: 8 }}>
        <span className={`${styles.badge} ${styles.toneUnknown}`}>NOT CONFIGURED</span>{' '}
        This client has not configured a website, so EIP has no site to measure. No substitute
        site is checked.
      </p>
    );
  }
  const tone =
    website.outcome === 'ONLINE'
      ? styles.toneOk
      : website.outcome
        ? styles.toneBad
        : styles.toneUnknown;

  return (
    <>
      <dl className={styles.grid} style={{ marginTop: 8 }}>
        <Cell label="Website">
          <span className={styles.muted}>{website.url}</span>
        </Cell>
        <Cell label="Status">
          <span className={`${styles.badge} ${tone}`}>
            {website.outcome ? website.outcome.replace(/_/g, ' ') : 'NOT CHECKED'}
          </span>
        </Cell>
        <Cell label="HTTP status">
          <Measured value={website.httpStatus} />
        </Cell>
        <Cell label="Response time">
          <Measured value={website.responseTimeMs} unit="ms" />
        </Cell>
        <Cell label="TLS">
          {website.tls.valid === null ? (
            <span className={styles.unknown}>UNKNOWN</span>
          ) : website.tls.valid ? (
            <span className={`${styles.badge} ${styles.toneOk}`}>VALID</span>
          ) : (
            <span className={`${styles.badge} ${styles.toneBad}`}>INVALID</span>
          )}
        </Cell>
        <Cell label="Last check">
          {website.lastCheckedAt ? (
            new Date(website.lastCheckedAt).toLocaleString()
          ) : (
            <span className={styles.unknown}>NEVER CHECKED</span>
          )}
        </Cell>
        <Cell label="Freshness">
          <FreshnessTag state={website.freshness.state} />
        </Cell>
      </dl>
      {website.message ? (
        <p className={styles.reason} style={{ marginTop: 8 }}>
          {website.message}
        </p>
      ) : null}
    </>
  );
}

/** One connected business system: status, connectors, resources, errors. */
function SystemBlock({
  system,
}: {
  system: OrganizationSourceGraphDto['businessSystems'][number];
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13, color: '#f8fafc' }}>{system.name}</strong>
        <span
          className={`${styles.badge} ${system.status === 'CONNECTED' ? styles.toneOk : styles.toneUnknown}`}
        >
          {system.status}
        </span>
        <FreshnessTag state={system.freshness.state} />
        {system.completeness ? (
          <span className={styles.muted}>{system.completeness}</span>
        ) : (
          <span className={styles.unknown}>COMPLETENESS UNKNOWN</span>
        )}
      </div>
      <p className={styles.reason} style={{ marginTop: 4 }}>
        {system.statusEvidence}
      </p>

      <dl className={styles.grid} style={{ marginTop: 8 }}>
        <Cell label="Connectors">
          <span className={styles.muted}>
            {system.connectors.length ? system.connectors.map((c) => c.name).join(', ') : 'NONE'}
          </span>
        </Cell>
        <Cell label="Discovered resources">
          <Measured value={system.totalResourceCount} unknownLabel="NOT DISCOVERED" />
        </Cell>
        <Cell label="Readable resources">
          <Measured value={system.availableResourceCount} unknownLabel="NOT DISCOVERED" />
        </Cell>
        <Cell label="Last retrieval">
          {system.lastSuccessfulRetrievalAt ? (
            new Date(system.lastSuccessfulRetrievalAt).toLocaleString()
          ) : (
            <span className={styles.unknown}>NEVER</span>
          )}
        </Cell>
      </dl>

      {/* Resources / capabilities — only what the source actually returned. */}
      {system.resources.length ? (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {system.resources.map((r) => (
            <span
              key={`${r.connectorId}:${r.id}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <AvailabilityBadge availability={r.availability} />
              <span className={styles.muted}>
                {r.label}
                {r.retrievedRecordCount === null
                  ? ' · records UNKNOWN'
                  : ` · ${r.retrievedRecordCount} records`}
              </span>
            </span>
          ))}
        </div>
      ) : (
        <p className={styles.reason} style={{ marginTop: 8 }}>
          No resources discovered for this system yet.
        </p>
      )}

      {system.errors.length ? (
        <ul className={styles.errorList} style={{ marginTop: 8 }}>
          {system.errors.map((e, i) => (
            <li key={i} className={styles.errorText}>
              {e}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OrgSourceOverview({ orgId }: { orgId: string }) {
  const [graph, setGraph] = useState<OrganizationSourceGraphDto | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const load = useCallback(async () => {
    try {
      setGraph(await fetchOrganizationSources(orgId));
      setState('ready');
    } catch {
      // A failure here is reported, never silently rendered as "nothing
      // connected" - those two look identical and mean opposite things.
      setState('unavailable');
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <section className={styles.card} style={{ marginBottom: 12 }}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Organisation connections</h3>
        </div>
        <p className={styles.body}>Reading the organisation&apos;s real sources…</p>
      </section>
    );
  }

  if (state === 'unavailable' || !graph) {
    return (
      <section className={styles.card} style={{ marginBottom: 12 }}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Organisation connections</h3>
          <span className={`${styles.badge} ${styles.toneBad}`}>UNAVAILABLE</span>
        </div>
        <p className={styles.body}>
          The source data for this organisation could not be read. EIP reports that rather than
          showing an empty view, which would be indistinguishable from a client with no connections.
        </p>
      </section>
    );
  }

  return (
    <section
      className={styles.card}
      style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div className={styles.cardHead}>
        <div>
          <div className={styles.eyebrow}>Organisation</div>
          <h3 className={styles.cardTitle}>{graph.organizationName ?? graph.organizationId}</h3>
        </div>
        <span className={styles.muted}>
          {graph.counts.businessSystems} system(s) · {graph.counts.connectors} connector(s)
        </span>
      </div>

      {/* ── Connected Website ─────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionTitle}>Connected Website</div>
        <WebsiteBlock website={graph.website} />
      </div>

      {/* ── Connected Systems ─────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionTitle}>Connected Systems</div>
        {graph.businessSystems.length === 0 ? (
          <p className={styles.body} style={{ marginTop: 8 }}>
            <span className={`${styles.badge} ${styles.toneUnknown}`}>NOT CONNECTED</span>{' '}
            No business system is connected to this organisation.
          </p>
        ) : (
          graph.businessSystems.map((sys) => <SystemBlock key={sys.id} system={sys} />)
        )}
      </div>

      {/* ── Connectors (the technical inventory) ──────────────────────── */}
      <div>
        <div className={styles.sectionTitle}>Connectors</div>
        <p className={styles.reason} style={{ marginTop: 4 }}>
          How EIP reaches each system. This is the technical layer and is deliberately separate from
          the systems above.
        </p>
        <div style={{ marginTop: 8 }}>
          {graph.connectors.length ? (
            <ConnectorTable connectors={graph.connectors} />
          ) : (
            <p className={styles.body}>No connectors are installed for this organisation.</p>
          )}
        </div>
      </div>
    </section>
  );
}

