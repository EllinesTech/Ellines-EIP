'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchEnterpriseSummary, getSession, type EnterpriseSummaryDto } from '@/lib/api';
import {
  buildOrgPeriodReport,
  type OrgSystemPeriod,
} from '@/lib/org-system';
import { canAccessOrgSystem } from '@/lib/org-ui-policy';
import styles from '../../command.module.css';
import adminStyles from '../../admin/admin.module.css';

const PERIODS: { id: OrgSystemPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom' },
];

export default function OrgSystemReportPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('owner');
  const [period, setPeriod] = useState<OrgSystemPeriod>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [generated, setGenerated] = useState(false);
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
    setRole(s.user.role);
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load snapshot'));
  }, [router]);

  const report = useMemo(() => {
    if (!generated) return '';
    return buildOrgPeriodReport({
      summary,
      orgName,
      role,
      period,
      customFrom: customFrom || undefined,
      customTo: customTo || undefined,
    });
  }, [generated, summary, orgName, role, period, customFrom, customTo]);

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
          <p className={styles.eyebrow}>Organization System · EIP above SoR</p>
          <h1>Generate report</h1>
          <p className={styles.lede}>
            Period summary from enterprise health, UEM counts, timeline, and Ellinea narrative.
            Observe-only — EIP does not write back to the System of Record.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/org-system" className={styles.ghostBtn}>
            Catalog
          </Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
          <Link href="/app/ellinea-console" className={styles.ghostBtn}>
            Console
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      {!synced ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>Sync required</strong>
            <p>Connectors must be synced before EIP can summarize org data for a period.</p>
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
      ) : null}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Period</div>
            <h2 className={styles.cardTitle}>Choose window · generate summary</h2>
          </div>
        </div>
        <div className={styles.periodTabs} role="tablist" aria-label="Report period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              className={styles.periodTab}
              data-active={period === p.id ? 'true' : 'false'}
              aria-selected={period === p.id}
              onClick={() => {
                setPeriod(p.id);
                setGenerated(false);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' ? (
          <form className={adminStyles.form} style={{ marginTop: '0.75rem' }} onSubmit={(e) => e.preventDefault()}>
            <label>
              From
              <input
                type="date"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setGenerated(false);
                }}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setGenerated(false);
                }}
              />
            </label>
          </form>
        ) : null}

        <div className={styles.headerActions} style={{ marginTop: '0.85rem', justifyContent: 'flex-start' }}>
          <button
            type="button"
            className={adminStyles.primary}
            onClick={() => setGenerated(true)}
            disabled={!synced && !summary}
          >
            Generate summary
          </button>
          <Link href="/app/reports" className={styles.ghostBtn}>
            Scheduled reports
          </Link>
        </div>

        {generated && report ? (
          <pre className={styles.reportBody}>{report}</pre>
        ) : (
          <p className={styles.lede} style={{ marginTop: '0.85rem' }}>
            Select a period, then generate. Ellinea Console / Ask can dig deeper after you review.
          </p>
        )}
      </section>
    </div>
  );
}
