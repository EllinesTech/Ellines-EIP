'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatOrgDateTime } from '@ellines-eip/shared';
import {
  DATETIME_PREFS_EVENT,
  fetchEnterpriseSummary,
  getSession,
  readCachedOrgDateTimeSettings,
  type EnterpriseSummaryDto,
  type OrgDateTimeSettingsDto,
} from '@/lib/api';
import styles from '../command.module.css';

type TimelineItem = {
  title: string;
  detail: string;
  at?: string;
};

function formatWhen(iso: string | undefined, prefs: OrgDateTimeSettingsDto, fallbackIso: string | null) {
  const value = iso || fallbackIso;
  if (!value) return 'Pending sync';
  try {
    const formatted = formatOrgDateTime(new Date(value), prefs);
    return `${formatted.day} · ${formatted.time}`;
  } catch {
    return new Date(value).toLocaleString();
  }
}

export default function EnterpriseTimelinePage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState<OrgDateTimeSettingsDto>({
    timeFormat: '12h',
    dateStyle: 'short',
  });

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    const cached = readCachedOrgDateTimeSettings(s.organization.id);
    if (cached) setPrefs(cached);
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent<{ orgId: string; settings: OrgDateTimeSettingsDto }>).detail;
      if (detail?.settings) setPrefs(detail.settings);
    };
    window.addEventListener(DATETIME_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(DATETIME_PREFS_EVENT, onPrefs);
  }, []);

  useEffect(() => {
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load timeline'));
  }, []);

  const synced = summary?.status === 'synced';
  const events: TimelineItem[] =
    synced && summary?.timeline?.length
      ? summary.timeline.map((item, index) => ({
          title: item.title,
          detail: item.detail,
          at:
            (item as TimelineItem).at ||
            (summary.syncedAt
              ? new Date(new Date(summary.syncedAt).getTime() - index * 90_000).toISOString()
              : undefined),
        }))
      : [
          {
            title: 'Platform ready',
            detail: 'Work Console is online. Sync a connector to populate the enterprise timeline.',
          },
          {
            title: 'Next step',
            detail: 'Org IT opens Connectors and runs Sync now (or waits for a due schedule).',
          },
        ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Command Center</p>
          <h1>Enterprise Timeline</h1>
          <p className={styles.lede}>
            Chronological feed from connected systems — decisions, alerts, and sync events in one
            place.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app" className={styles.ghostBtn}>
            Overview
          </Link>
          <Link href="/app/connectors" className={styles.ghostBtn}>
            Connectors
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <section className={styles.timeline}>
        <div className={styles.briefHead}>
          <div>
            <div className={styles.panelLabel}>Live feed</div>
            <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.05rem', color: '#fff' }}>
              {synced
                ? `${summary!.connectorName} · ${events.length} events`
                : 'Awaiting first connector sync'}
            </h2>
          </div>
          {synced && summary?.syncedAt ? (
            <span className={styles.time}>
              Synced {formatWhen(summary.syncedAt, prefs, summary.syncedAt)}
            </span>
          ) : null}
        </div>

        <ul className={styles.events} style={{ marginTop: '1rem' }}>
          {events.map((item) => (
            <li key={`${item.title}-${item.at || item.detail}`}>
              <span className={styles.rail} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.35rem 0.75rem',
                    alignItems: 'baseline',
                  }}
                >
                  <strong>{item.title}</strong>
                  <span className={styles.time}>{formatWhen(item.at, prefs, summary?.syncedAt || null)}</span>
                </div>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
