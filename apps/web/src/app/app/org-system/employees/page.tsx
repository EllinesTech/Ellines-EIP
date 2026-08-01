'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { fetchEnterpriseSummary, getSession, type EnterpriseSummaryDto } from '@/lib/api';
import { isPeopleKind } from '@/lib/org-system';
import styles from '../../command.module.css';

export default function OrgSystemEmployeesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!isOrgAdminRole(s.user.role)) {
      router.replace('/app');
      return;
    }
    setAllowed(true);
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load employees'));
  }, [router]);

  const synced = summary?.status === 'synced';
  const employees = useMemo(() => {
    const objects = summary?.model?.objects || [];
    return objects.filter((o) => isPeopleKind(o.kind));
  }, [summary]);
  const peopleCount = summary?.model?.counts?.people ?? employees.length;

  if (!allowed) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking access…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Organization System</p>
          <h1>Employee register</h1>
          <p className={styles.lede}>
            Read-only people / staff / users from UEM after connector sync. Owner actions stay on Org
            Admin — EIP does not write back to HR Systems of Record.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/org-system" className={styles.ghostBtn}>
            Catalog
          </Link>
          <Link href="/app/people" className={styles.ghostBtn}>
            Companion People
          </Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>People in model</span>
          <strong>{synced ? peopleCount : '—'}</strong>
          <em>{synced ? summary!.connectorName : 'Awaiting sync'}</em>
        </div>
        <div className={styles.kpi}>
          <span>Listed objects</span>
          <strong>{synced ? employees.length : '—'}</strong>
          <em>person / staff / user</em>
        </div>
        <div className={styles.kpi}>
          <span>Systems</span>
          <strong>{synced ? summary!.connectedSystems : '—'}</strong>
          <em>Connected</em>
        </div>
        <div className={styles.kpi}>
          <span>Health</span>
          <strong>{synced ? summary!.healthScore : '—'}</strong>
          <em>Enterprise score</em>
        </div>
      </div>

      {!synced ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>No employee sync yet</strong>
            <p>
              Sync an HR-capable connector so UEM people objects appear here. Until then the register
              stays empty rather than inventing a directory.
            </p>
          </div>
          <Link href="/app/connectors" className={styles.primaryLink}>
            Open Connectors →
          </Link>
        </div>
      ) : null}

      <section className={styles.card} style={{ marginTop: '0.75rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Register</div>
            <h2 className={styles.cardTitle}>
              {synced
                ? employees.length
                  ? `${employees.length} employees / people`
                  : 'Snapshot live — no people objects yet'
                : 'Awaiting connector sync'}
            </h2>
          </div>
          <Link href="/app/admin" className={styles.primaryLink}>
            Org Admin →
          </Link>
        </div>

        {synced && !employees.length ? (
          <div className={styles.emptyCallout} style={{ marginTop: '0.55rem' }}>
            <div>
              <strong>No person / staff objects in UEM</strong>
              <p>Use Enterprise Search or Ask Ellinea once a people-capable connector publishes objects.</p>
            </div>
            <Link href="/app/search" className={styles.primaryLink}>
              Search →
            </Link>
          </div>
        ) : null}

        {employees.length ? (
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {employees.map((item) => (
              <li key={item.id}>
                <span className={styles.dot} />
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.kind}
                    {item.status ? ` · ${item.status}` : ''}
                    {item.branchId ? ` · branch ${item.branchId}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.headerActions} style={{ marginTop: '1rem', justifyContent: 'flex-start' }}>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask Ellinea about workforce →
          </Link>
          <Link href="/app/ellinea-console" className={styles.primaryLink}>
            Ellinea Console →
          </Link>
        </div>
      </section>
    </div>
  );
}
