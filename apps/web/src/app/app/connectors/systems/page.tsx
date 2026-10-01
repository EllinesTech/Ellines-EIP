'use client';

/**
 * Connected Systems — the real business systems this organisation is connected
 * to, and what each one actually provides.
 *
 * WHAT THIS PAGE IS NOT
 * ---------------------
 * It is not a connector list. A connector is the mechanism; a system is the
 * thing. One system is reached through one or more connectors and may expose
 * many resources through them — EIP does not need a separate connector per
 * business module, and this page makes that visible rather than hiding it.
 *
 * NOTHING HERE IS INVENTED
 * ------------------------
 *   - No system is shown as CONNECTED merely because a connector row exists. It
 *     takes a resource that was genuinely read.
 *   - A capability the source never returned is simply absent. There is no
 *     default list of ERP/POS/HR/Finance modules to fall back on.
 *   - Record counts, completeness and freshness come from the persisted
 *     retrieval evidence. An unmeasured value renders UNKNOWN, not 0.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  fetchOrganizationSources,
  type BusinessSystemDto,
  type OrganizationSourceGraphDto,
} from '@/lib/api';
import {
  ConnectorTable,
  FreshnessTag,
  Measured,
  ResourceTable,
} from '@/components/source-graph/SourceModules';
import styles from './connected-systems.module.css';

function SystemCard({ system }: { system: BusinessSystemDto }) {
  const connected = system.status === 'CONNECTED';
  return (
    <section className={styles.system}>
      <header className={styles.systemHead}>
        <div>
          <div className={styles.eyebrow}>Connected system</div>
          <h2 className={styles.systemName}>{system.name}</h2>
          {system.description ? <p className={styles.systemDesc}>{system.description}</p> : null}
        </div>
        <span className={`${styles.badge} ${connected ? styles.toneOk : styles.toneMuted}`}>
          {system.status}
        </span>
      </header>

      {/* The evidence behind the status is always shown, so a green badge is
          never an unexplained claim. */}
      <p className={styles.evidence}>{system.statusEvidence}</p>

      <dl className={styles.grid}>
        <div className={styles.cell}>
          <dt className={styles.label}>Connector used</dt>
          <dd className={styles.value}>
            {system.connectors.length ? (
              system.connectors.map((c) => c.name).join(', ')
            ) : (
              <span className={styles.unknown}>NONE</span>
            )}
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>Connector status</dt>
          <dd className={styles.value}>
            {system.connectors.length ? (
              <span className={styles.muted}>
                {system.connectors.map((c) => c.status).join(', ')}
              </span>
            ) : (
              <span className={styles.unknown}>UNKNOWN</span>
            )}
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>Resources</dt>
          <dd className={styles.value}>
            <Measured value={system.totalResourceCount} unknownLabel="NOT DISCOVERED" />
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>Readable resources</dt>
          <dd className={styles.value}>
            <Measured value={system.availableResourceCount} unknownLabel="NOT DISCOVERED" />
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>Last successful retrieval</dt>
          <dd className={styles.value}>
            {system.lastSuccessfulRetrievalAt ? (
              new Date(system.lastSuccessfulRetrievalAt).toLocaleString()
            ) : (
              <span className={styles.unknown}>NEVER</span>
            )}
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>Freshness</dt>
          <dd className={styles.value}>
            <FreshnessTag state={system.freshness.state} />
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>Completeness</dt>
          <dd className={styles.value}>
            {/* null = never determined. Never rendered as COMPLETE or 0. */}
            {system.completeness === null ? (
              <span className={styles.unknown}>UNKNOWN</span>
            ) : (
              <span className={styles.muted}>{system.completeness}</span>
            )}
          </dd>
        </div>
      </dl>

      {system.errors.length ? (
        <div className={styles.errors}>
          <h3 className={styles.errorsTitle}>Reported problems</h3>
          <ul className={styles.errorList}>
            {system.errors.map((e, i) => (
              <li key={i} className={styles.errorText}>
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className={styles.sectionTitle}>
        Discovered resources
        <span className={styles.sectionHint}>only what the source actually returned</span>
      </h3>
      {system.resources.length ? (
        <ResourceTable resources={system.resources} />
      ) : (
        <p className={styles.emptyNote}>
          No resources have been discovered for this system yet. Discovery runs from a real response
          from the source, so this stays empty until one is received.
        </p>
      )}
    </section>
  );
}

export default function ConnectedSystemsPage() {
  const [graph, setGraph] = useState<OrganizationSourceGraphDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGraph(await fetchOrganizationSources());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connected systems.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <main className={styles.page}>
        <p className={styles.errorText}>{error}</p>
        <button type="button" className={styles.button} onClick={() => void load()}>
          Try again
        </button>
      </main>
    );
  }

  if (!graph) {
    return <main className={styles.page}>Loading connected systems…</main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Connected Systems</h1>
        <p className={styles.subtitle}>
          The business systems EIP is connected to, and what each one actually provides. A system
          is reached through a connector; it is not the connector. One connector can serve many
          resources in one system.
        </p>
      </header>

      {graph.businessSystems.length === 0 ? (
        <section className={styles.system}>
          <span className={`${styles.badge} ${styles.toneMuted}`}>NOT CONNECTED</span>
          <h2 className={styles.systemName}>No business system connected</h2>
          <p className={styles.emptyNote}>
            No business system is connected to this organisation. EIP does not create a placeholder
            system, and does not list modules this organisation may or may not have.
          </p>
        </section>
      ) : (
        graph.businessSystems.map((s) => <SystemCard key={s.id} system={s} />)
      )}

      {/* The technical layer, kept visibly separate from the systems above. */}
      <section className={styles.system}>
        <h2 className={styles.systemName}>Connectors</h2>
        <p className={styles.systemDesc}>
          How EIP reaches each system. These are the technical connections, listed separately from
          the business systems they serve.
        </p>
        {graph.connectors.length ? (
          <ConnectorTable connectors={graph.connectors} />
        ) : (
          <p className={styles.emptyNote}>No connectors are installed for this organisation.</p>
        )}
      </section>
    </main>
  );
}
