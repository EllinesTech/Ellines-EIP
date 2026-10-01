'use client';

/**
 * Connectors — the technical inventory.
 *
 * Answers exactly one question: HOW does EIP reach the connected sources? It is
 * deliberately a separate page from Connected Systems, because "Connectors: 1"
 * is not an answer to "is my business connected?".
 *
 * Every column is real. There is no health score column, because no
 * evidence-based measurement produces one; and a connector that has never
 * synced says NEVER SYNCED rather than showing a green status derived from a
 * database flag.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  fetchOrganizationSources,
  type OrganizationSourceGraphDto,
} from '@/lib/api';
import { ConnectorTable } from '@/components/source-graph/SourceModules';
import styles from './connectors-inventory.module.css';

export default function ConnectorsInventoryPage() {
  const [graph, setGraph] = useState<OrganizationSourceGraphDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGraph(await fetchOrganizationSources());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connectors.');
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

  if (!graph) return <main className={styles.page}>Loading connectors…</main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Connectors</h1>
        <p className={styles.subtitle}>
          The technical connections EIP uses to reach your sources, and what each has actually
          read. For the business systems these serve, see Connected Systems.
        </p>
      </header>

      {graph.connectors.length === 0 ? (
        <p className={styles.emptyNote}>
          No connectors are installed for this organisation. Nothing is listed here because nothing
          is configured — EIP does not create a connector entry to fill the page.
        </p>
      ) : (
        <ConnectorTable connectors={graph.connectors} />
      )}
    </main>
  );
}
