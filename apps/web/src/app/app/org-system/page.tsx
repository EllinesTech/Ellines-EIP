'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchEnterpriseSummary, getSession, type EnterpriseSummaryDto } from '@/lib/api';
import {
  detectHealthcareLabel,
  groupCapabilitiesByDomain,
} from '@/lib/org-system-catalog';
import { canAccessOrgSystem } from '@/lib/org-ui-policy';
import styles from '../command.module.css';

const PRODUCT_LEDE =
  'Ellines EIP sits above your Systems of Record (ERP, CRM, HIS like Hospidia, HR). It connects and observes — it does not replace them. After sync, Organization System surfaces everything connected systems expose for Owner / IT (and work roles when authorized in Settings). Ellinea AI stays in the loop.';

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
    if (!canAccessOrgSystem(s.user.role, s.organization.id)) {
      router.replace('/app');
      return;
    }
    setAllowed(true);
    setOrgName(s.organization.name);
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load snapshot'));
  }, [router]);

  const groups = useMemo(() => groupCapabilitiesByDomain(summary), [summary]);
  const synced = summary?.status === 'synced';
  const label = detectHealthcareLabel(summary);

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
          <p className={styles.eyebrow}>Organization System · EIP above SoR · Ellinea in the loop</p>
          <h1>Capabilities from connected systems</h1>
          <p className={styles.lede}>
            {PRODUCT_LEDE} Viewing {orgName || 'your org'}
            {synced ? ` · ${label === 'patients' ? 'healthcare' : 'commercial'} lens` : ''}.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/connectors" className={styles.ghostBtn}>
            Connectors
          </Link>
          <Link href="/app/connectors#eip-autoscan" className={styles.ghostBtn}>
            Auto-scan
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
              Sync a connector (or run Auto-scan) so EIP can observe UEM counts, objects, timeline,
              alerts, and decisions. Until then capabilities stay ready with unlock CTAs — EIP will
              not invent SoR data.
            </p>
          </div>
          <div className={styles.headerActions} style={{ justifyContent: 'flex-start', gap: '0.65rem' }}>
            <Link href="/app/connectors" className={styles.primaryLink}>
              Open Connectors →
            </Link>
            <Link href="/app/connectors#eip-autoscan" className={styles.primaryLink}>
              Auto-scan →
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.opsRail}>
          <span className={styles.opsLink} style={{ cursor: 'default' }}>
            Live · {summary!.connectorName}
          </span>
          <span className={styles.opsLink} style={{ cursor: 'default' }}>
            Health {summary!.healthScore} · alerts {summary!.openAlerts} · decisions{' '}
            {summary!.openDecisions}
          </span>
          <Link href="/app/timeline" className={styles.opsLink}>
            Timeline
          </Link>
          <Link href="/app/glance" className={styles.opsLink}>
            Glance
          </Link>
          <Link href="/app/people" className={styles.opsLink}>
            People
          </Link>
          <Link href="/app/fleet" className={styles.opsLink}>
            Fleet
          </Link>
          <Link href="/app/inbox" className={styles.opsLink}>
            Inbox
          </Link>
        </div>
      )}

      {groups.map(({ domain, items }) => (
        <section key={domain.id} className={styles.card} style={{ marginTop: '0.85rem' }}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.panelLabel}>{domain.label}</div>
              <h2 className={styles.cardTitle}>{domain.blurb}</h2>
            </div>
          </div>
          <div className={styles.taskGrid}>
            {items.map(({ cap, availability: av }) => {
              const muted = av.status === 'needs-sync' || av.status === 'no-data';
              return (
                <Link
                  key={cap.id}
                  href={cap.href}
                  className={styles.taskCard}
                  data-soon={muted ? 'true' : undefined}
                >
                  <p className={styles.taskCardLabel}>{av.badge}</p>
                  <h3 className={styles.taskCardTitle}>{cap.title}</h3>
                  <p className={styles.taskCardPurpose}>{cap.purpose}</p>
                  <p className={styles.taskCardCta}>
                    {av.status === 'needs-sync'
                      ? 'Sync or Auto-scan to unlock →'
                      : av.status === 'no-data'
                        ? 'Open · no data yet →'
                        : 'Open →'}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
