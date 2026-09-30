'use client';

/**
 * /app/admin/audit — Organisation audit log.
 * All actions by org members are recorded here.
 * Owner/Admin only.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  getSession,
  listOrgAuditLogs,
  type AuditLogDto,
} from '@/lib/api';
import styles from '../../command.module.css';

const ACTION_COLOR: Record<string, string> = {
  create: '#10b981',
  update: '#3b82f6',
  delete: '#ef4444',
  login:  '#8b5cf6',
  invite: '#f59e0b',
};

function actionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLOR)) {
    if (action.toLowerCase().includes(key)) return color;
  }
  return '#8b95a8';
}

export default function AdminAuditPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace('/login'); return; }
    if (!isOrgAdminRole(session.user.role)) { router.replace('/app'); return; }

    listOrgAuditLogs(200)
      .then(setLogs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load audit log'))
      .finally(() => setLoading(false));
  }, [router]);

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? logs.filter((l) => `${l.action} ${l.resource ?? ''} ${l.actorEmail ?? ''} ${l.actorName ?? ''}`.toLowerCase().includes(needle))
    : logs;

  if (loading) return <div className={styles.page} style={{ padding: '2rem' }}><p style={{ color: '#8b95a8' }}>Loading audit log…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Administration · Audit</p>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Audit Log</h1>
          <p className={styles.lede}>All actions performed by organisation members, in chronological order.</p>
        </div>
      </header>

      {error && <div role="alert" style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}

      {/* KPI + Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div className={styles.kpi} style={{ minWidth: 100 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f4f7fb' }}>{logs.length}</span>
          <span style={{ fontSize: '0.72rem', color: '#8b95a8', marginTop: 2 }}>Entries</span>
        </div>
        <input
          type="search"
          placeholder="Search action, resource, actor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 380, background: '#161b26', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#f4f7fb', padding: '0.4rem 0.75rem', fontFamily: 'inherit', fontSize: '0.84rem' }}
          aria-label="Search audit log"
        />
        {needle && <span style={{ fontSize: '0.78rem', color: '#8b95a8' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>}
      </div>

      {/* Log table */}
      {filtered.length === 0 ? (
        <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#8b95a8' }}>
          {logs.length === 0 ? 'No audit entries yet.' : 'No entries match your search.'}
        </div>
      ) : (
        <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 1fr', gap: '0.5rem', padding: '0.55rem 1rem', background: 'rgba(255,255,255,0.03)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8b95a8' }}>
            <span>Action</span>
            <span>Resource</span>
            <span>Actor</span>
            <span style={{ textAlign: 'right' }}>When</span>
          </div>
          {filtered.map((log, i) => (
            <div key={`${log.id}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 1fr', gap: '0.5rem', padding: '0.65rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: actionColor(log.action) }}>{log.action}</span>
              <span style={{ fontSize: '0.78rem', color: '#8b95a8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.resource ?? '—'}</span>
              <span style={{ fontSize: '0.78rem', color: '#f4f7fb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {log.actorEmail ?? log.actorName ?? '—'}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#8b95a8', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
