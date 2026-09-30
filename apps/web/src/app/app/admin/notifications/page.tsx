'use client';

/**
 * /app/admin/notifications — Notification management.
 * View outbox, configure delivery policy, manage push subscriptions.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  getSession,
  listNotifyOutbox,
  fetchNotifyDeliveryPolicy,
  fetchNotifyUnreadCount,
  type NotifyOutboxItemDto,
  type NotifyDeliveryPolicyDto,
} from '@/lib/api';
import styles from '../../command.module.css';

const STATUS_COLOR: Record<string, string> = {
  sent: '#10b981',
  delivered: '#10b981',
  failed: '#ef4444',
  pending: '#f59e0b',
  queued: '#3b82f6',
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [outbox, setOutbox] = useState<NotifyOutboxItemDto[]>([]);
  const [policy, setPolicy] = useState<NotifyDeliveryPolicyDto | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace('/login'); return; }
    if (!isOrgAdminRole(session.user.role)) { router.replace('/app'); return; }

    Promise.all([
      listNotifyOutbox().catch(() => [] as NotifyOutboxItemDto[]),
      fetchNotifyDeliveryPolicy().catch(() => null as NotifyDeliveryPolicyDto | null),
      fetchNotifyUnreadCount().catch(() => ({ unread: 0, total: 0 })),
    ]).then(([o, p, u]) => {
      setOutbox(o);
      setPolicy(p);
      setUnread(typeof u === 'number' ? u : (u as { unread: number }).unread ?? 0);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className={styles.page} style={{ padding: '2rem' }}><p style={{ color: '#8b95a8' }}>Loading notifications…</p></div>;

  const panelStyle: React.CSSProperties = {
    background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem',
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Administration · Notifications</p>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Notifications</h1>
          <p className={styles.lede}>Outbox log, delivery policy, and push subscription status.</p>
        </div>
      </header>

      {error && <div role="alert" style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}

      {/* KPIs */}
      <div className={styles.kpis} style={{ marginBottom: '1.5rem' }}>
        <div className={styles.kpi}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f4f7fb' }}>{outbox.length}</span>
          <span style={{ fontSize: '0.72rem', color: '#8b95a8', marginTop: 2 }}>Total in outbox</span>
        </div>
        <div className={styles.kpi}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: unread > 0 ? '#f59e0b' : '#f4f7fb' }}>{unread}</span>
          <span style={{ fontSize: '0.72rem', color: '#8b95a8', marginTop: 2 }}>Unread</span>
        </div>
        <div className={styles.kpi}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>{outbox.filter((o) => o.status === 'failed').length}</span>
          <span style={{ fontSize: '0.72rem', color: '#8b95a8', marginTop: 2 }}>Failed</span>
        </div>
      </div>

      {/* Delivery policy summary */}
      {policy && (
        <section style={panelStyle}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#f4f7fb' }}>Delivery Policy</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {Object.entries(policy).filter(([, v]) => typeof v === 'boolean').map(([k, v]) => (
              <span key={k} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 99, background: v ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)', color: v ? '#10b981' : '#8b95a8', border: `1px solid ${v ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}` }}>
                {k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}: {v ? '✓' : '✗'}
              </span>
            ))}
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#8b95a8' }}>
            Configure in <a href="/app/admin/settings" style={{ color: '#8b5cf6', textDecoration: 'none' }}>Business Settings</a>.
          </p>
        </section>
      )}

      {/* Outbox */}
      <section>
        <h2 className={styles.sectionTitle} style={{ marginBottom: '0.75rem' }}>Notification Outbox</h2>
        {outbox.length === 0 ? (
          <div style={{ ...panelStyle, textAlign: 'center', color: '#8b95a8', padding: '2rem' }}>
            <p style={{ margin: 0 }}>No notifications sent yet.</p>
          </div>
        ) : (
          <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
            {outbox.slice(0, 50).map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '0.75rem 1rem', borderBottom: i < outbox.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f4f7fb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.subject}
                  </div>
                  {item.body && <div style={{ fontSize: '0.75rem', color: '#8b95a8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.body.slice(0, 120)}</div>}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: STATUS_COLOR[item.status ?? 'pending'] ?? '#8b95a8', textTransform: 'uppercase' }}>{item.status ?? 'pending'}</span>
                  <div style={{ fontSize: '0.72rem', color: '#8b95a8' }}>{item.at ? new Date(item.at).toLocaleString() : '—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
