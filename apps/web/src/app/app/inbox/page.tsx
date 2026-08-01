'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  fetchEnterpriseSummary,
  getSession,
  listInstallations,
  type ConnectorInstallationDto,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import styles from '../command.module.css';

export default function InboxCompanionPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [installs, setInstalls] = useState<ConnectorInstallationDto[]>([]);
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const s = getSession();
    if (s) setOrgAdmin(isOrgAdminRole(s.user.role));
    Promise.all([fetchEnterpriseSummary(), listInstallations().catch(() => [] as ConnectorInstallationDto[])])
      .then(([snap, list]) => {
        setSummary(snap);
        setInstalls(list);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load inbox companion'));
  }, []);

  const emailInstalls = installs.filter(
    (i) =>
      i.catalogId?.toLowerCase().includes('email') ||
      i.displayName?.toLowerCase().includes('email'),
  );
  const synced = summary?.status === 'synced';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mobile Work Companion</p>
          <h1>Work email summary</h1>
          <p className={styles.lede}>
            Ellinea summarizes highlights from the work email connector. EIP wraps the inbox — it
            does not become your mail server.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.ghostBtn}>
              Connectors
            </Link>
          ) : null}
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>Email connectors</span>
          <strong>{emailInstalls.length}</strong>
          <em>Installed for this org</em>
        </div>
        <div className={styles.kpi}>
          <span>Snapshot</span>
          <strong>{synced ? 'Live' : 'Idle'}</strong>
          <em>{synced ? summary!.connectorName : 'Sync email to populate'}</em>
        </div>
      </div>

      <section className={styles.card} style={{ marginTop: '1rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Ellinea summary</div>
            <h2 className={styles.cardTitle}>
              {emailInstalls.length ? 'Ready when mail syncs' : 'No email connector yet'}
            </h2>
          </div>
        </div>

        {!emailInstalls.length ? (
          <div className={styles.emptyCallout} style={{ marginTop: '0.85rem' }}>
            <strong>Connect work email first</strong>
            <p>
              Owner/IT installs the email connector under Connectors. Until then this companion
              shows a clear empty state instead of inventing inbox content.
            </p>
          </div>
        ) : (
          <div className={styles.emptyCallout} style={{ marginTop: '0.85rem' }}>
            <strong>Summarize with Ask Ellinea</strong>
            <p>
              {emailInstalls.length} email install(s) detected
              {synced
                ? `. Snapshot highlight: ${summary!.briefHighlight || 'see Overview.'}`
                : '. Run Sync on the email connector, then ask Ellinea for inbox highlights.'}
            </p>
          </div>
        )}

        {emailInstalls.length ? (
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {emailInstalls.map((item) => (
              <li key={item.id}>
                <span className={styles.dot} />
                <div>
                  <strong>{item.displayName || item.catalogId}</strong>
                  <p>
                    {item.status}
                    {item.lastSyncedAt ? ` · last sync ${item.lastSyncedAt}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.headerActions} style={{ marginTop: '1rem', justifyContent: 'flex-start' }}>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask Ellinea to summarize work mail →
          </Link>
          <Link href="/app/glance" className={styles.primaryLink}>
            Live glance →
          </Link>
        </div>
      </section>
    </div>
  );
}
