'use client';

/**
 * /app/business — Business Overview.
 * Enterprise health composite KPIs from fetchEnterpriseSummary.
 * Available: health score, connected systems, open decisions, branches, people, tasks, alerts.
 * Sub-nav: Performance, Reports, Analytics (Planned).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  getSession,
  fetchEnterpriseSummary,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import styles from '../command.module.css';

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={styles.kpi} style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8b95a8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: '1.65rem', fontWeight: 800, color: color ?? '#f4f7fb', lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: '0.72rem', color: '#8b95a8' }}>{sub}</span>}
    </div>
  );
}

export default function BusinessOverviewPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace('/login'); return; }
    setIsAdmin(isOrgAdminRole(session.user.role));
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className={styles.page} style={{ padding: '2rem' }}><p style={{ color: '#8b95a8' }}>Loading business overview…</p></div>;

  const counts = summary?.model?.counts;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Business · Overview</p>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Business Overview</h1>
          <p className={styles.lede}>
            Composite enterprise health from all connected systems.
            {summary?.syncedAt && ` Last synced: ${new Date(summary.syncedAt).toLocaleString()}`}
          </p>
        </div>
        {isAdmin && (
          <div className={styles.headerActions}>
            <Link href="/app/connectors" className={styles.ghostBtn}>Connectors</Link>
          </div>
        )}
      </header>

      {error && <div role="alert" style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}

      {/* No connector callout */}
      {summary?.status === 'idle' && (
        <div className={styles.emptyCallout} style={{ marginBottom: '1.5rem' }}>
          <div>
            <strong>Connect your first system</strong>
            <p>Install a connector to unlock live business KPIs — ERP, CRM, HR, and more.</p>
          </div>
          {isAdmin && <Link href="/app/connectors" style={{ padding: '0.4rem 1rem', background: '#7c3aed', color: '#fff', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Open Connectors</Link>}
        </div>
      )}

      {/* Primary KPIs */}
      <section style={{ marginBottom: '1.75rem' }}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: '0.75rem' }}>Enterprise Health</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <MetricCard
            label="Health Score"
            value={summary?.healthScore != null ? `${summary.healthScore}%` : '—'}
            sub="Composite from all connectors"
            color={summary?.healthScore != null ? (summary.healthScore >= 80 ? '#10b981' : summary.healthScore >= 50 ? '#f59e0b' : '#ef4444') : '#8b95a8'}
          />
          <MetricCard
            label="Connected Systems"
            // Business systems only, from the persisted source classification.
            // This is NOT the connector count: an organisation whose only source
            // is a website reached by one API connector has 0 here.
            value={summary?.connectedSystems ?? 0}
            sub="Business systems (not connectors)"
            color={summary?.connectedSystems ? '#10b981' : '#8b95a8'}
          />
          <MetricCard
            label="Websites"
            value={summary?.sourceCounts?.websites ?? 0}
            sub="Connected website sources"
          />
          <MetricCard
            label="Connectors"
            value={summary?.sourceCounts?.connectors ?? 0}
            sub="Technical inventory"
          />
          <MetricCard
            label="Open Decisions"
            value={summary?.openDecisions ?? '—'}
            sub="Approvals pending"
            color={summary?.openDecisions ? '#f59e0b' : '#f4f7fb'}
          />
          <MetricCard
            label="Open Alerts"
            value={summary?.openAlerts ?? 0}
            sub="Active issues"
            color={(summary?.openAlerts ?? 0) > 0 ? '#ef4444' : '#10b981'}
          />
          <MetricCard label="Branches" value={counts?.branches ?? '—'} sub="Org branches" />
          <MetricCard label="People" value={counts?.people ?? '—'} sub="Active employees" />
          <MetricCard label="Tasks" value={counts?.tasks ?? '—'} sub="Open tasks" />
        </div>
      </section>

      {/* Sub-section navigation */}
      <section style={{ marginBottom: '1.75rem' }}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: '0.75rem' }}>Business Modules</h2>
        <div className={styles.taskGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {[
            { href: '/app/business/performance', label: 'Performance', desc: 'Trends, growth, and KPI comparisons.', available: true },
            { href: '/app/business/reports', label: 'Reports', desc: 'Scheduled and on-demand reports.', available: true },
            { href: '/app/business/analytics', label: 'Analytics', desc: 'Deep-dive data analytics.', available: false },
          ].map((item) => (
            <div key={item.href} style={{ background: '#161b26', border: `1px solid ${item.available ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 12, padding: '1rem 1.1rem', opacity: item.available ? 1 : 0.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f4f7fb', display: 'flex', alignItems: 'center', gap: 8 }}>
                {item.label}
                {!item.available && <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: '#8b95a8', fontWeight: 600 }}>Planned</span>}
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#8b95a8', lineHeight: 1.4 }}>{item.desc}</p>
              {item.available && (
                <Link href={item.href} style={{ marginTop: 4, fontSize: '0.78rem', color: '#8b5cf6', textDecoration: 'none', fontWeight: 600 }}>Open →</Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Brief highlight */}
      {summary?.briefHighlight && (
        <section>
          <h2 className={styles.sectionTitle} style={{ marginBottom: '0.75rem' }}>Ellinea Brief</h2>
          <div style={{ background: '#161b26', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: '1rem 1.25rem', fontSize: '0.88rem', color: '#f4f7fb', lineHeight: 1.6 }}>
            <span style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>✦ Ellinea</span>
            {summary.briefHighlight}
          </div>
        </section>
      )}
    </div>
  );
}
