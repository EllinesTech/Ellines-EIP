'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatOrgDateTime, isOrgAdminRole } from '@ellines-eip/shared';
import {
  DATETIME_PREFS_EVENT,
  getSession,
  listOrgAuditLogs,
  readCachedOrgDateTimeSettings,
  type AuditLogDto,
  type OrgDateTimeSettingsDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

function summarize(entry: AuditLogDto): string {
  const meta = entry.metadata || {};
  const bits: string[] = [];
  if (typeof meta.email === 'string') bits.push(meta.email);
  if (typeof meta.role === 'string') bits.push(`role ${meta.role}`);
  if (typeof meta.name === 'string') bits.push(meta.name);
  if (typeof meta.branchId === 'string' && typeof meta.name !== 'string') {
    bits.push(`branch ${meta.branchId.slice(0, 8)}`);
  }
  if (entry.resource) bits.push(entry.resource);
  return bits.length ? bits.join(' · ') : '—';
}

export default function AuditPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [items, setItems] = useState<AuditLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [datePrefs, setDatePrefs] = useState<OrgDateTimeSettingsDto>({
    timeFormat: '12h',
    dateStyle: 'short',
  });

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
    const cached = readCachedOrgDateTimeSettings(s.organization.id);
    if (cached) setDatePrefs(cached);

    const onDate = (e: Event) => {
      const detail = (e as CustomEvent<{ settings: OrgDateTimeSettingsDto }>).detail;
      if (detail?.settings) setDatePrefs(detail.settings);
    };
    window.addEventListener(DATETIME_PREFS_EVENT, onDate);

    listOrgAuditLogs(100)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load audit log'))
      .finally(() => setLoading(false));

    return () => window.removeEventListener(DATETIME_PREFS_EVENT, onDate);
  }, [router]);

  function formatWhen(iso: string) {
    try {
      const f = formatOrgDateTime(new Date(iso), datePrefs);
      return `${f.day} · ${f.time}`;
    } catch {
      return new Date(iso).toLocaleString();
    }
  }

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
          <p className={styles.eyebrow}>Owner / IT Admin</p>
          <h1>Audit Center</h1>
          <p className={styles.lede}>
            Invites, role changes, org structure, connector syncs, and auth events for this organization.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/admin" className={styles.ghostBtn}>
            Org Admin
          </Link>
          <Link href="/app/connectors" className={styles.ghostBtn}>
            Connectors
          </Link>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => {
              setLoading(true);
              setError('');
              listOrgAuditLogs(100)
                .then(setItems)
                .catch((err) =>
                  setError(err instanceof Error ? err.message : 'Failed to refresh'),
                )
                .finally(() => setLoading(false));
            }}
          >
            Refresh
          </button>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Recent events · {items.length}</div>
        {loading ? (
          <p className={styles.lede}>Loading audit trail…</p>
        ) : items.length === 0 ? (
          <p className={styles.lede} style={{ marginTop: '0.5rem' }}>
            No audit events yet. Invites, structure changes, and syncs will appear here.
          </p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{formatWhen(row.createdAt)}</td>
                  <td>
                    <code className={adminStyles.actionCode}>{row.action}</code>
                  </td>
                  <td>
                    {row.actorName || row.actorEmail || 'System'}
                    {row.actorEmail && row.actorName ? (
                      <span className={styles.lede} style={{ display: 'block', fontSize: '0.68rem' }}>
                        {row.actorEmail}
                      </span>
                    ) : null}
                  </td>
                  <td>{summarize(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
