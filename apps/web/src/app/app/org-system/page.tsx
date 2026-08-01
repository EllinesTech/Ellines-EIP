'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { fetchEnterpriseSummary, getSession, type EnterpriseSummaryDto } from '@/lib/api';
import { ORG_SYSTEM_TASKS } from '@/lib/org-system';
import styles from '../command.module.css';

export default function OrgSystemHubPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [orgName, setOrgName] = useState('');
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
    setOrgName(s.organization.name);
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load snapshot'));
  }, [router]);

  if (!allowed) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking access…</p>
      </div>
    );
  }

  const synced = summary?.status === 'synced';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Organization System</p>
          <h1>Tasks on your connected systems</h1>
          <p className={styles.lede}>
            EIP wraps {orgName || 'your org'} Systems of Record — pick a service to observe and
            summarize. Owner / IT Admin only for now; other roles can be authorized later.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/connectors" className={styles.ghostBtn}>
            Connectors
          </Link>
          <Link href="/app/ellinea-console" className={styles.ghostBtn}>
            Ellinea Console
          </Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      {!synced ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>No live sync yet</strong>
            <p>
              Tasks need a connector snapshot. Install and Sync under Connectors — EIP observes; it
              does not replace Hospidia / ERP.
            </p>
          </div>
          <Link href="/app/connectors" className={styles.primaryLink}>
            Open Connectors →
          </Link>
        </div>
      ) : (
        <div className={styles.opsRail}>
          <span className={styles.opsLink} style={{ cursor: 'default' }}>
            Live · {summary!.connectorName}
          </span>
          <Link href="/app/timeline" className={styles.opsLink}>
            Timeline
          </Link>
          <Link href="/app/glance" className={styles.opsLink}>
            Glance
          </Link>
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Catalog</div>
            <h2 className={styles.cardTitle}>Organization services &amp; tasks</h2>
          </div>
        </div>
        <div className={styles.taskGrid}>
          {ORG_SYSTEM_TASKS.map((task) =>
            task.comingSoon || !task.href ? (
              <div key={task.id} className={styles.taskCard} data-soon="true">
                <p className={styles.taskCardLabel}>Coming soon</p>
                <h3 className={styles.taskCardTitle}>{task.title}</h3>
                <p className={styles.taskCardPurpose}>{task.purpose}</p>
                <p className={styles.taskCardCta}>Stub — not wired yet</p>
              </div>
            ) : (
              <Link key={task.id} href={task.href} className={styles.taskCard}>
                <p className={styles.taskCardLabel}>Ready</p>
                <h3 className={styles.taskCardTitle}>{task.title}</h3>
                <p className={styles.taskCardPurpose}>{task.purpose}</p>
                <p className={styles.taskCardCta}>Open task →</p>
              </Link>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
