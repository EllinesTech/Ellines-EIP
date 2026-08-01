'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatOrgDateTime } from '@ellines-eip/shared';
import {
  DATETIME_PREFS_EVENT,
  fetchEnterpriseSummary,
  getSession,
  readCachedOrgDateTimeSettings,
  type EnterpriseSummaryDto,
  type OrgDateTimeSettingsDto,
} from '@/lib/api';
import {
  DEFAULT_UI_PREFS,
  readUiPrefs,
  UI_PREFS_EVENT,
  type UiPrefs,
} from '@/lib/ui-prefs';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

type AppNotification = {
  id: string;
  kind: 'alert' | 'decision' | 'sync' | 'system';
  title: string;
  detail: string;
  at: string | null;
  href?: string;
};

const READ_KEY = 'eip_notifications_read';
const DELETED_KEY = 'eip_notifications_deleted';
const NOTIFICATIONS_CHANGED_EVENT = 'eip-notifications-changed';

function readIdSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids].slice(-300)));
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
}

function readDeletedNotificationIds(): Set<string> {
  return readIdSet(DELETED_KEY);
}

function buildNotifications(
  summary: EnterpriseSummaryDto | null,
  prefs: UiPrefs,
): AppNotification[] {
  const items: AppNotification[] = [];
  const syncedAt = summary?.syncedAt || null;

  if (!summary || summary.status !== 'synced') {
    items.push({
      id: 'system-awaiting-sync',
      kind: 'system',
      title: 'No live snapshot yet',
      detail: 'Open Connectors and run Sync now to populate alerts and decisions.',
      at: null,
      href: '/app/connectors',
    });
    return items;
  }

  if (prefs.notifyAlerts && summary.openAlerts > 0) {
    items.push({
      id: `alerts-${summary.syncedAt}-${summary.openAlerts}`,
      kind: 'alert',
      title: `${summary.openAlerts} open alert${summary.openAlerts === 1 ? '' : 's'}`,
      detail: summary.briefHighlight || 'Review alerts from connected systems.',
      at: syncedAt,
      href: '/app',
    });
  }

  if (summary.openDecisions > 0) {
    items.push({
      id: `decisions-${summary.syncedAt}-${summary.openDecisions}`,
      kind: 'decision',
      title: `${summary.openDecisions} open decision${summary.openDecisions === 1 ? '' : 's'}`,
      detail: 'Approvals and actions waiting in the enterprise queue.',
      at: syncedAt,
      href: '/app/approvals',
    });
  }

  if (prefs.notifySyncEvents) {
    items.push({
      id: `sync-${summary.connectorId}-${summary.syncedAt}`,
      kind: 'sync',
      title: `Synced · ${summary.connectorName}`,
      detail: `Health ${summary.healthScore} · ${summary.connectedSystems} system(s)`,
      at: syncedAt,
      href: '/app/connectors',
    });
  }

  for (const [i, event] of (summary.timeline || []).slice(0, 8).entries()) {
    items.push({
      id: `timeline-${i}-${event.title}`,
      kind: 'system',
      title: event.title,
      detail: event.detail,
      at: syncedAt
        ? new Date(new Date(syncedAt).getTime() - i * 120_000).toISOString()
        : null,
      href: '/app/timeline',
    });
  }

  return items;
}

export default function NotificationsPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [datePrefs, setDatePrefs] = useState<OrgDateTimeSettingsDto>({
    timeFormat: '12h',
    dateStyle: 'short',
  });
  const [read, setRead] = useState<Set<string>>(new Set());
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setPrefs(readUiPrefs());
    setRead(readIdSet(READ_KEY));
    setDeleted(readIdSet(DELETED_KEY));
    const cached = readCachedOrgDateTimeSettings(s.organization.id);
    if (cached) setDatePrefs(cached);
    const onUi = (e: Event) => {
      const detail = (e as CustomEvent<UiPrefs>).detail;
      if (detail) setPrefs(detail);
    };
    const onDate = (e: Event) => {
      const detail = (e as CustomEvent<{ settings: OrgDateTimeSettingsDto }>).detail;
      if (detail?.settings) setDatePrefs(detail.settings);
    };
    window.addEventListener(UI_PREFS_EVENT, onUi);
    window.addEventListener(DATETIME_PREFS_EVENT, onDate);
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
    return () => {
      window.removeEventListener(UI_PREFS_EVENT, onUi);
      window.removeEventListener(DATETIME_PREFS_EVENT, onDate);
    };
  }, []);

  const allItems = useMemo(() => buildNotifications(summary, prefs), [summary, prefs]);
  const items = useMemo(
    () => allItems.filter((n) => !deleted.has(n.id)),
    [allItems, deleted],
  );
  const unread = items.filter((n) => !read.has(n.id)).length;

  function markAllRead() {
    const next = new Set(read);
    for (const n of items) next.add(n.id);
    setRead(next);
    writeIdSet(READ_KEY, next);
  }

  function markRead(id: string) {
    const next = new Set(read);
    next.add(id);
    setRead(next);
    writeIdSet(READ_KEY, next);
  }

  function deleteOne(id: string) {
    const next = new Set(deleted);
    next.add(id);
    setDeleted(next);
    writeIdSet(DELETED_KEY, next);
    const nextRead = new Set(read);
    nextRead.add(id);
    setRead(nextRead);
    writeIdSet(READ_KEY, nextRead);
  }

  function deleteAllVisible() {
    if (!items.length) return;
    const next = new Set(deleted);
    const nextRead = new Set(read);
    for (const n of items) {
      next.add(n.id);
      nextRead.add(n.id);
    }
    setDeleted(next);
    setRead(nextRead);
    writeIdSet(DELETED_KEY, next);
    writeIdSet(READ_KEY, nextRead);
  }

  function formatWhen(iso: string | null) {
    if (!iso) return '—';
    try {
      const f = formatOrgDateTime(new Date(iso), datePrefs);
      return `${f.day} · ${f.time}`;
    } catch {
      return new Date(iso).toLocaleString();
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Command Center</p>
          <h1>Notifications</h1>
          <p className={styles.lede}>
            Alerts, decisions, and sync events from your enterprise snapshot
            {unread ? ` · ${unread} unread` : ''}.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.ghostBtn} onClick={markAllRead} disabled={!unread}>
            Mark all read
          </button>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={deleteAllVisible}
            disabled={!items.length}
          >
            Delete all
          </button>
          <Link href="/app/settings" className={styles.ghostBtn}>
            Notification settings
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <section className={styles.timeline}>
        <div className={styles.panelLabel}>Feed</div>
        {items.length === 0 ? (
          <p className={styles.lede}>
            {allItems.length ? 'All notifications deleted for this feed.' : 'Nothing to show yet.'}
          </p>
        ) : (
          <ul className={styles.events} style={{ marginTop: '0.75rem' }}>
            {items.map((n) => {
              const isUnread = !read.has(n.id);
              return (
                <li key={n.id} style={{ opacity: isUnread ? 1 : 0.72 }}>
                  <span className={styles.rail} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.35rem 0.65rem',
                        alignItems: 'baseline',
                      }}
                    >
                      <span className={styles.uemKind}>{n.kind}</span>
                      <strong>{n.title}</strong>
                      <span className={styles.time}>{formatWhen(n.at)}</span>
                    </div>
                    <p>{n.detail}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.3rem' }}>
                      {n.href ? (
                        <Link
                          href={n.href}
                          className={styles.primaryLink}
                          onClick={() => markRead(n.id)}
                        >
                          Open →
                        </Link>
                      ) : null}
                      {isUnread ? (
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          style={{ minHeight: 30, padding: '0.2rem 0.5rem' }}
                          onClick={() => markRead(n.id)}
                        >
                          Mark read
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        style={{ minHeight: 30, padding: '0.2rem 0.5rem' }}
                        onClick={() => deleteOne(n.id)}
                        aria-label={`Delete ${n.title}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
