'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { fetchEnterpriseSummary, getSession, type EnterpriseSummaryDto } from '@/lib/api';
import {
  detectHealthcareLabel,
  filterTodayClientObjects,
  filterTodayTimelineEvents,
} from '@/lib/org-system';
import styles from '../../command.module.css';

type LabelMode = 'auto' | 'patients' | 'clients';

export default function OrgSystemClientsTodayPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [labelMode, setLabelMode] = useState<LabelMode>('auto');
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
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load today view'));
  }, [router]);

  const synced = summary?.status === 'synced';
  const inferred = detectHealthcareLabel(summary);
  const label = labelMode === 'auto' ? inferred : labelMode;
  const noun = label === 'patients' ? 'Patients' : 'Clients';
  const nounLower = label === 'patients' ? 'patients' : 'clients';

  const objects = useMemo(
    () => filterTodayClientObjects(summary?.model?.objects || []),
    [summary],
  );
  const events = useMemo(
    () => filterTodayTimelineEvents(summary?.timeline || []),
    [summary],
  );

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
          <p className={styles.eyebrow}>Organization System · EIP above SoR</p>
          <h1>{noun} today</h1>
          <p className={styles.lede}>
            EIP sits above HIS / CRM Systems of Record. Today’s {nounLower} are summarized from UEM
            objects and timeline heuristics — label defaults from connector keywords (healthcare →
            patients); override with the toggle.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/org-system" className={styles.ghostBtn}>
            Catalog
          </Link>
          <Link href="/app/timeline" className={styles.ghostBtn}>
            Timeline
          </Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <div className={styles.periodTabs} role="group" aria-label="Patients or clients label">
        {(
          [
            { id: 'auto' as const, text: `Auto (${inferred})` },
            { id: 'patients' as const, text: 'Patients' },
            { id: 'clients' as const, text: 'Clients' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={styles.periodTab}
            data-active={labelMode === opt.id ? 'true' : 'false'}
            onClick={() => setLabelMode(opt.id)}
          >
            {opt.text}
          </button>
        ))}
      </div>

      {!synced ? (
        <div className={styles.emptyCallout} style={{ marginTop: '0.85rem' }}>
          <div>
            <strong>Sync required for today’s {nounLower}</strong>
            <p>
              Without a connector sync, EIP cannot observe appointments, visits, or client activity
              from the System of Record.
            </p>
          </div>
          <Link href="/app/connectors" className={styles.primaryLink}>
            Open Connectors →
          </Link>
        </div>
      ) : null}

      <div className={styles.kpis} style={{ marginTop: '0.85rem' }}>
        <div className={styles.kpi}>
          <span>{noun} objects</span>
          <strong>{synced ? objects.length : '—'}</strong>
          <em>Kind / name heuristics</em>
        </div>
        <div className={styles.kpi}>
          <span>Timeline hits</span>
          <strong>{synced ? events.length : '—'}</strong>
          <em>Today-oriented events</em>
        </div>
        <div className={styles.kpi}>
          <span>Alerts</span>
          <strong className={(summary?.openAlerts || 0) > 0 ? styles.warn : undefined}>
            {synced ? summary!.openAlerts : '—'}
          </strong>
          <em>Open pressure</em>
        </div>
        <div className={styles.kpi}>
          <span>Source</span>
          <strong style={{ fontSize: '1.05rem' }}>
            {synced ? summary!.connectorName.slice(0, 18) : '—'}
          </strong>
          <em>Last sync snapshot</em>
        </div>
      </div>

      <section className={styles.card} style={{ marginTop: '0.75rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>{noun} · objects</div>
            <h2 className={styles.cardTitle}>
              {synced
                ? objects.length
                  ? `${objects.length} matched`
                  : `No ${nounLower} objects in this snapshot`
                : 'Awaiting sync'}
            </h2>
          </div>
        </div>
        {synced && objects.length ? (
          <ul className={styles.list} style={{ marginTop: '0.55rem' }}>
            {objects.map((item) => (
              <li key={item.id}>
                <span className={styles.dot} />
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.kind}
                    {item.status ? ` · ${item.status}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : synced ? (
          <p className={styles.lede} style={{ marginTop: '0.55rem' }}>
            Timeline below may still show activity. Ask Ellinea for a deeper dig once more SoR
            objects sync.
          </p>
        ) : null}
      </section>

      <section className={styles.card} style={{ marginTop: '0.75rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Timeline · today heuristic</div>
            <h2 className={styles.cardTitle}>
              {synced ? `${events.length} event(s)` : 'No snapshot'}
            </h2>
          </div>
          <Link href="/app/notifications" className={styles.primaryLink}>
            Inbox →
          </Link>
        </div>
        {synced && events.length ? (
          <ul className={styles.list} style={{ marginTop: '0.55rem' }}>
            {events.map((event, i) => (
              <li key={`${event.title}-${i}`}>
                <span className={styles.dot} />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : synced ? (
          <p className={styles.lede} style={{ marginTop: '0.55rem' }}>
            No today-oriented timeline matches. Full feed is on Enterprise Timeline.
          </p>
        ) : null}

        <div className={styles.headerActions} style={{ marginTop: '1rem', justifyContent: 'flex-start' }}>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask Ellinea about today →
          </Link>
          <Link href="/app/ellinea-console" className={styles.primaryLink}>
            Ellinea Console →
          </Link>
        </div>
      </section>
    </div>
  );
}
