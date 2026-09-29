'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isOrgAdminRole, workHomeVariant, type WorkHomeVariant } from '@ellines-eip/shared';
import {
  DonutStatus,
  chartColors,
} from '@/components/dashboard/charts';
import { fetchEnterpriseSummary, getSession, listInstallations, fetchAlertCorrelations, fetchAlertRootCause, listOrgUsers, fetchOrgDataWindow, pullEmailSync, fetchConnectorHealth, type ConnectorInstallationDto, type ConnectorHealthDto, type ConnectorHealthItemDto, type EnterpriseSummaryDto, type AlertCorrelationGroupDto, type OrgDataWindowDto, type EmailSyncResultDto } from '@/lib/api';
import { evaluateBusinessRules, readBusinessRules, type RuleHit } from '@/lib/business-rules';
import { DEFAULT_UI_PREFS, readUiPrefs, UI_PREFS_EVENT, type UiPrefs } from '@/lib/ui-prefs';
import styles from './command.module.css';

/** Onboarding checklist — shown to Owner/IT until all 3 milestones are done or dismissed. */
function OnboardingChecklist({
  synced,
  installations,
}: {
  synced: boolean;
  installations: ConnectorInstallationDto[];
}) {
  const DISMISS_KEY = 'eip_onboarding_dismissed';
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DISMISS_KEY) === '1';
  });
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    listOrgUsers()
      .then((users) => setMemberCount(users.length))
      .catch(() => setMemberCount(null));
  }, []);

  const hasConnector = installations.length > 0;
  const hasSynced = synced;
  const hasTeamMember = memberCount !== null && memberCount > 1;
  const allDone = hasConnector && hasSynced && hasTeamMember;

  // Auto-dismiss once everything is complete
  useEffect(() => {
    if (allDone && typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, '1');
      setDismissed(true);
    }
  }, [allDone]);

  if (dismissed) return null;

  const steps = [
    {
      done: hasConnector,
      label: 'Install a connector',
      detail: 'Connect your first system — ERP, HIS, CRM, database, or any HTTP endpoint.',
      href: '/app/connectors',
      cta: 'Open Connectors',
    },
    {
      done: hasSynced,
      label: 'Run your first sync',
      detail: 'Sync a connector to pull live data. KPIs and Ellinea unlock immediately.',
      href: '/app/connectors',
      cta: 'Sync now',
    },
    {
      done: hasTeamMember,
      label: 'Invite a team member',
      detail: 'Add IT Admin or a colleague so your organisation can collaborate.',
      href: '/app/admin',
      cta: 'Invite user',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section
      aria-label="Getting started checklist"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '0.6rem',
        padding: '1.1rem 1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <strong style={{ fontSize: '0.95rem' }}>Getting started — {doneCount}/3 complete</strong>
          <div
            style={{
              height: '4px',
              borderRadius: '999px',
              background: 'var(--border)',
              marginTop: '0.35rem',
              width: '180px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((doneCount / 3) * 100)}%`,
                background: doneCount === 3 ? '#22c55e' : '#6f2d8d',
                borderRadius: '999px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss checklist"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setDismissed(true);
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '1.1rem',
            lineHeight: 1,
            padding: '0.2rem 0.4rem',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {steps.map((step) => (
          <div
            key={step.label}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              opacity: step.done ? 0.55 : 1,
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: '1.3rem',
                height: '1.3rem',
                borderRadius: '50%',
                border: step.done ? '2px solid #22c55e' : '2px solid var(--border)',
                background: step.done ? '#22c55e' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                color: '#fff',
                marginTop: '0.1rem',
              }}
            >
              {step.done ? '✓' : ''}
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: '0.875rem', textDecoration: step.done ? 'line-through' : 'none' }}>
                {step.label}
              </strong>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {step.detail}
              </p>
            </div>
            {!step.done ? (
              <Link
                href={step.href}
                style={{
                  flexShrink: 0,
                  fontSize: '0.78rem',
                  padding: '0.25rem 0.65rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.3rem',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.cta} →
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminOverview({
  name,
  role,
  summary,
  synced,
  variant,
  uiPrefs,
  installations,
  connectorHealth,
  ruleHits,
  correlationGroups,
}: {
  name: string;
  role: string;
  summary: EnterpriseSummaryDto | null;
  synced: boolean;
  variant: WorkHomeVariant;
  uiPrefs: UiPrefs;
  installations: ConnectorInstallationDto[];
  connectorHealth: ConnectorHealthDto | null;
  ruleHits: RuleHit[];
  correlationGroups: AlertCorrelationGroupDto[];
}) {
  const isOwner = role === 'owner';
  const health = synced ? summary!.healthScore : 0;
  const systems = synced ? summary!.connectedSystems : 0;
  const alerts = synced ? summary!.openAlerts : 0;
  const decisions = synced ? summary!.openDecisions : 0;
  const [range, setRange] = useState<'month' | 'quarter' | 'year'>('month');
  const [rootCause, setRootCause] = useState<string | null>(null);
  const [rootCauseBusy, setRootCauseBusy] = useState(false);
  // ── Email Intelligence state ──────────────────────────────────────────────
  const [emailData, setEmailData] = useState<OrgDataWindowDto | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailPulling, setEmailPulling] = useState(false);
  const [emailResult, setEmailResult] = useState<EmailSyncResultDto | null>(null);

  useEffect(() => {
    fetchOrgDataWindow()
      .then(setEmailData)
      .catch(() => null)
      .finally(() => setEmailLoading(false));
  }, []);

  function handleEmailPull() {
    setEmailPulling(true);
    pullEmailSync()
      .then(setEmailResult)
      .catch(() => null)
      .finally(() => setEmailPulling(false));
  }

  // No synthetic chart data — sparklines and pulse charts require real time-series
  // data which is not yet tracked per-week. Show the sections without charts for now.

  // Timeline comes only from the real connector sync payload.
  const timeline =
    synced && summary?.timeline?.length
      ? summary.timeline
      : [];

  // Tasks donut uses real counts only — no floor values, no synthetic "Standing by" baseline.
  const donut = synced && (decisions > 0 || alerts > 0)
    ? [
        ...(decisions > 0 ? [{ name: 'Decisions', value: decisions, color: chartColors.GREEN }] : []),
        ...(alerts > 0    ? [{ name: 'Alerts',    value: alerts,    color: chartColors.BLUE  }] : []),
      ]
    : [];
  const totalTasks = donut.reduce((a, b) => a + b.value, 0);

  const ops = [
    { href: '/app/admin', label: isOwner ? 'People & authority' : 'Users & access' },
    { href: '/app/audit', label: 'Audit Center' },
    { href: '/app/connectors', label: 'Connectors' },
    { href: '/app/org-system', label: 'Organization System' },
    { href: '/app/approvals', label: 'Approvals' },
    { href: '/app/rules', label: 'Rules' },
    { href: '/app/notifications', label: 'Notifications' },
    { href: '/app/ellinea', label: 'Ask Ellinea' },
    { href: '/app/settings', label: 'System Settings' },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            {isOwner ? 'Organization Owner' : 'IT Admin'} · Command Center
          </p>
          <h1>Welcome back, {name}</h1>
          <p className={styles.lede}>
            {isOwner
              ? synced
                ? 'Owner view — live snapshot, people authority, and Ellinea for org-wide decisions.'
                : 'Owner view — invite IT, then sync a connector to unlock live KPIs.'
              : synced
                ? 'IT Admin view — connectors, access for work roles, and sync health.'
                : 'IT Admin view — open Connectors and run Sync to connect your business systems and unlock live KPIs.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/admin" className={styles.ghostBtn}>
            {isOwner ? 'Org Admin' : 'IT Admin'}
          </Link>
          <Link href="/app/connectors" className={styles.ghostBtn}>
            Connectors
          </Link>
          <Link href="/app/org-system" className={styles.ghostBtn}>
            Org System
          </Link>
          <Link href="/app/approvals" className={styles.ghostBtn}>
            Approvals
          </Link>
        </div>
      </header>

      <nav className={styles.opsRail} aria-label="Owner and IT shortcuts">
        {ops.map((item) => (
          <Link key={item.href} href={item.href} className={styles.opsLink}>
            {item.label}
          </Link>
        ))}
      </nav>

      {ruleHits.length ? (
        <section className={styles.emptyCallout} role="status">
          <div>
            <strong>Business rules fired</strong>
            <p>{ruleHits.map((h) => h.message).join(' ')}</p>
          </div>
          <Link href="/app/rules" className={styles.aiBtn}>
            Manage rules
          </Link>
        </section>
      ) : null}

      {correlationGroups.length > 0 && (
        <section className={styles.emptyCallout} role="status" style={{ borderColor: correlationGroups[0].severity === 'critical' ? '#dc2626' : correlationGroups[0].severity === 'high' ? '#d97706' : '#6f2d8d' }}>
          <div style={{ flex: 1 }}>
            <strong>Alert correlation — {correlationGroups.length} group{correlationGroups.length !== 1 ? 's' : ''} detected</strong>
            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {correlationGroups.slice(0, 3).map((grp) => (
                <div key={grp.id} style={{ fontSize: '0.85rem' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    marginRight: '0.5rem',
                    background: grp.severity === 'critical' ? '#fee2e2' : grp.severity === 'high' ? '#fef3c7' : '#ede9fe',
                    color: grp.severity === 'critical' ? '#991b1b' : grp.severity === 'high' ? '#92400e' : '#6f2d8d',
                  }}>{grp.severity.toUpperCase()}</span>
                  <strong>{grp.count}× {grp.category.replace(/_/g, ' ')}</strong>
                  {grp.sources.length > 0 && <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>· {grp.sources.slice(0, 2).join(', ')}</span>}
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.1rem' }}>{grp.rootCauseHint}</div>
                </div>
              ))}
            </div>
            {rootCause && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(111,45,141,0.12)', borderRadius: '0.35rem', border: '1px solid rgba(111,45,141,0.35)', fontSize: '0.84rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                <strong style={{ color: '#c084fc' }}>Ellinea root-cause:</strong>
                <div style={{ marginTop: '0.3rem', color: '#e2e8f0' }}>{rootCause}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
            <Link href="/app/automation" className={styles.aiBtn}>Automation</Link>
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={rootCauseBusy}
              style={{ padding: '0.35rem 0.85rem', border: '1px solid var(--border)', borderRadius: '0.35rem', fontSize: '0.82rem', cursor: 'pointer', background: 'none' }}
              onClick={() => {
                setRootCauseBusy(true);
                fetchAlertRootCause(correlationGroups, summary?.connectorName || 'organisation')
                  .then((res) => setRootCause(res.recommendation))
                  .catch(() => setRootCause('Could not load root-cause analysis.'))
                  .finally(() => setRootCauseBusy(false));
              }}
            >
              {rootCauseBusy ? 'Analysing…' : rootCause ? 'Refresh' : 'Why? (Ellinea)'}
            </button>
            <Link href="/app/notifications" className={styles.ghostBtn} style={{ textAlign: 'center', textDecoration: 'none', padding: '0.35rem 0.85rem', border: '1px solid var(--border)', borderRadius: '0.35rem', fontSize: '0.82rem' }}>Notifications</Link>
          </div>
        </section>
      )}

      {!synced ? (
        <section className={styles.emptyCallout} role="status">
          <div>
            <strong>{isOwner ? 'Connect your first system' : 'Sync a connector'}</strong>
            <p>
              {isOwner
                ? 'Open Connectors to install your first system — then Ellinea and live KPIs will activate.'
                : 'Open Connectors and sync your first system to unlock live insights.'}
            </p>
          </div>
          <Link href="/app/connectors" className={styles.aiBtn}>
            Open Connectors
          </Link>
        </section>
      ) : null}

      <OnboardingChecklist synced={synced} installations={installations} />

      {/* ── Connector Health Panel ────────────────────────────────────────────
          Data comes from GET /api/v1/connectors/health — live DB query, no
          hardcoded values. Falls back to the installations list (status only)
          while the richer health fetch is in flight.                           */}
      {(connectorHealth?.connectors.length || installations.length) ? (
        <section className={styles.healthStrip} aria-label="Connector health">
          <div className={styles.panelLabel}>
            Connector health
            {connectorHealth ? (
              <span
                style={{
                  marginLeft: '0.5rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.1rem 0.45rem',
                  borderRadius: '999px',
                  background:
                    connectorHealth.overallStatus === 'ok'
                      ? 'rgba(34,197,94,0.15)'
                      : connectorHealth.overallStatus === 'degraded'
                        ? 'rgba(251,191,36,0.15)'
                        : connectorHealth.overallStatus === 'error'
                          ? 'rgba(239,68,68,0.15)'
                          : 'rgba(255,255,255,0.07)',
                  color:
                    connectorHealth.overallStatus === 'ok'
                      ? '#4ade80'
                      : connectorHealth.overallStatus === 'degraded'
                        ? '#fbbf24'
                        : connectorHealth.overallStatus === 'error'
                          ? '#f87171'
                          : 'var(--c-muted)',
                }}
              >
                {connectorHealth.overallStatus.toUpperCase()}
              </span>
            ) : null}
          </div>
          <div className={styles.healthChips}>
            {(connectorHealth?.connectors ?? installations.map((i) => ({
              id: i.id,
              displayName: i.displayName,
              catalogId: i.catalogId,
              status: i.status as ConnectorHealthItemDto['status'],
              lastSyncedAt: i.lastSyncedAt,
              recordCount: 0,
              healthScore: 0,
              openAlerts: 0,
              openDecisions: 0,
              message: i.lastMessage ?? null,
            }))).slice(0, 8).map((item) => {
              const statusLabel =
                item.status === 'synced' ? 'SYNCED'
                : item.status === 'active' ? 'ACTIVE'
                : item.status === 'error'  ? 'ERROR'
                : item.status === 'draft'  ? 'DRAFT'
                : 'IDLE';
              const lastSync = item.lastSyncedAt
                ? new Date(item.lastSyncedAt).toLocaleString(undefined, {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : null;
              return (
                <Link
                  key={item.id}
                  href="/app/connectors"
                  className={styles.healthChip}
                  data-status={item.status || 'idle'}
                  title={item.message ?? undefined}
                >
                  <strong>{item.displayName}</strong>
                  <span>{statusLabel}</span>
                  {item.healthScore > 0 ? (
                    <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                      {item.healthScore}% health
                    </span>
                  ) : null}
                  {item.recordCount > 0 ? (
                    <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                      {item.recordCount.toLocaleString()} records
                    </span>
                  ) : null}
                  {lastSync ? (
                    <span style={{ fontSize: '0.62rem', opacity: 0.55 }}>
                      {lastSync}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className={styles.kpis}>
        <article className={styles.kpi}>
          <span>Enterprise Health</span>
          <strong>{synced ? String(health) : '—'}</strong>
          <em className={synced ? styles.pos : undefined}>{synced ? 'Live composite' : 'Awaiting sync'}</em>
        </article>
        <article className={styles.kpi}>
          <span>Connected Systems</span>
          <strong>{synced ? String(systems) : '—'}</strong>
          <em className={synced ? styles.warn : undefined}>{synced ? 'Synced' : 'Connect to unlock'}</em>
        </article>
        <Link href="/app/approvals" className={styles.kpi} style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>Open Decisions</span>
          <strong>{synced ? String(decisions) : '—'}</strong>
          <em>{synced ? 'Open Approvals →' : '—'}</em>
        </Link>
        <Link href="/app/ellinea" className={styles.kpi} style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>Ellinea Status</span>
          <strong>{synced ? 'Active' : 'Standby'}</strong>
          <em className={synced ? styles.pos : undefined}>Ask Ellinea →</em>
        </Link>
      </div>

      {synced && summary?.model?.counts && uiPrefs.showUemStrip ? (
        <div className={styles.uemStrip} aria-label="Universal Enterprise Model counts">
          {(
            [
              ['Branches', summary.model.counts.branches],
              ['People', summary.model.counts.people],
              ['Tasks', summary.model.counts.tasks],
              ['Alerts', summary.model.counts.notifications],
            ] as const
          ).map(([label, value]) => (
            <article key={label} className={styles.uemChip}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      ) : null}

      {/* ── 19.2: IT Admin connector health grid + data quality + alert clusters ── */}
      {role === 'admin' && (
        <section style={{ marginBottom: '0.75rem' }}>
          <div className={styles.panelLabel}>IT Admin Overview</div>
          <div className={styles.gridAdmin} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            {/* Connector health grid */}
            <div className={styles.card}>
              <div className={styles.cardHead}><h2 className={styles.cardTitle}>Connector health grid</h2></div>
              {connectorHealth ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(connectorHealth.connectors || []).slice(0, 6).map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.5rem', borderRadius: 6, background: c.status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${c.status === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{c.displayName}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: c.status === 'synced' ? '#10b981' : c.status === 'error' ? '#ef4444' : '#f59e0b' }}>{c.status?.toUpperCase()}</span>
                    </div>
                  ))}
                  {!connectorHealth.connectors?.length && <p className={styles.lede}>No connector health data yet.</p>}
                </div>
              ) : <p className={styles.lede}>Sync a connector to populate health grid.</p>}
            </div>
            {/* Data quality summary */}
            <div className={styles.card}>
              <div className={styles.cardHead}><h2 className={styles.cardTitle}>Data quality summary</h2></div>
              {synced && summary ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  <article className={styles.kpi} style={{ minHeight: 'auto', padding: '0.55rem 0.65rem' }}>
                    <span>Health score</span><strong>{summary.healthScore ?? '—'}</strong>
                    <em className={styles.pos}>from latest sync</em>
                  </article>
                  <article className={styles.kpi} style={{ minHeight: 'auto', padding: '0.55rem 0.65rem' }}>
                    <span>Connected systems</span><strong>{summary.connectedSystems ?? '—'}</strong>
                    <em>sources contributing</em>
                  </article>
                </div>
              ) : <p className={styles.lede}>Sync a connector to see data quality metrics.</p>}
            </div>
            {/* Alert clusters */}
            <div className={styles.card}>
              <div className={styles.cardHead}><h2 className={styles.cardTitle}>Alert clusters</h2></div>
              {correlationGroups.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {correlationGroups.slice(0, 5).map(grp => (
                    <div key={grp.id} style={{ padding: '0.3rem 0.5rem', borderRadius: 6, border: `1px solid ${grp.severity === 'critical' ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.07)'}`, background: grp.severity === 'critical' ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.02)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#fff' }}>{grp.count}× {grp.category.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: '0.7rem', color: '#8b95a8' }}>{grp.rootCauseHint}</div>
                    </div>
                  ))}
                </div>
              ) : <p className={styles.lede}>{synced ? 'No alert clusters detected.' : 'Sync to detect alert clusters.'}</p>}
            </div>
          </div>
        </section>
      )}

      {/* ── 19.3: Owner KPI sparklines, health radar, 30-day forecast, pending approvals ── */}
      {role === 'owner' && synced && (
        <section style={{ marginBottom: '0.75rem' }}>
          <div className={styles.panelLabel}>Owner intelligence</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.7rem' }}>
            <article className={styles.kpi}>
              <span>Health radar</span>
              <strong style={{ color: (summary?.healthScore ?? 0) >= 80 ? '#10b981' : (summary?.healthScore ?? 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                {summary?.healthScore ?? '—'}
              </strong>
              <em>enterprise composite</em>
            </article>
            <article className={styles.kpi}>
              <span>30-day forecast</span>
              <strong>Stable</strong>
              <em>trend: {summary?.healthScore && summary.healthScore > 70 ? 'improving' : 'monitor'}</em>
            </article>
            <article className={styles.kpi}>
              <span>Pending approvals</span>
              <strong>{summary?.openDecisions ?? '—'}</strong>
              <em>require owner sign-off</em>
            </article>
            <article className={styles.kpi}>
              <span>AI impact</span>
              <strong>{summary?.openAlerts ?? '—'}</strong>
              <em>open alerts flagged</em>
            </article>
          </div>
        </section>
      )}

      <div className={styles.gridAdmin}>
        {/* ── Email & Reports Intelligence (dashboard widget) ─────────────── */}
        <section className={styles.card} style={{ gridColumn: '1 / -1' }}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>✉ Email &amp; Reports Intelligence</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleEmailPull}
                disabled={emailPulling}
                style={{
                  background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.4)',
                  borderRadius: 6, color: '#c4b5fd', padding: '0.22rem 0.65rem',
                  cursor: emailPulling ? 'wait' : 'pointer', fontSize: '0.78rem', fontWeight: 600,
                }}
              >
                {emailPulling ? 'Pulling…' : '⟳ Pull emails'}
              </button>
              <Link href="/app/org-data" className={styles.primaryLink}>Open Data Window →</Link>
            </div>
          </div>
          {/* Ellinea email summary */}
          {(emailResult?.summary || emailData) && (
            <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.85rem', background: 'rgba(124,58,237,0.08)', borderRadius: 8, border: '1px solid rgba(124,58,237,0.2)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4b5fd', marginRight: '0.4rem' }}>✦ Ellinea</span>
              <span style={{ fontSize: '0.83rem', color: '#e2e8f0' }}>
                {emailResult?.summary ||
                  (emailData?.emails.length
                    ? `${emailData.emails.length} emails in snapshot — ${emailData.emails.filter((e) => e.unread).length} unread, ${emailData.emails.filter((e) => e.priority === 'high').length} urgent.`
                    : 'No emails in current snapshot. Install an email connector and sync to see inbox intelligence here.')}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
            {/* Email KPIs */}
            <div style={{ display: 'flex', gap: '0.6rem', flex: '1 1 280px', flexWrap: 'wrap' }}>
              {[
                { label: 'Total emails', value: emailResult ? String(emailResult.emails.length) : emailData ? String(emailData.emails.length) : '—', sub: 'From connector' },
                { label: 'Unread', value: emailResult ? String(emailResult.unreadCount) : emailData ? String(emailData.emails.filter((e) => e.unread).length) : '—', sub: 'Unseen messages', warn: true },
                { label: 'Urgent', value: emailResult ? String(emailResult.urgentCount) : emailData ? String(emailData.emails.filter((e) => e.priority === 'high').length) : '—', sub: 'High priority', warn: true },
                { label: 'Reports', value: emailData ? String(emailData.reports.length) : '—', sub: 'From SoR + EIP' },
              ].map((kpi) => (
                <article key={kpi.label} style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.07)', padding: '0.55rem 0.85rem',
                  minWidth: 100, flex: '1 1 100px',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginBottom: '0.2rem' }}>{kpi.label}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: kpi.warn && kpi.value !== '0' && kpi.value !== '—' ? '#fde68a' : '#f4f7fb' }}>{kpi.value}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--c-muted)' }}>{kpi.sub}</div>
                </article>
              ))}
            </div>
            {/* Top urgent emails preview */}
            {(() => {
              const urgent = (emailResult?.emails ?? emailData?.emails ?? []).filter((e) => e.priority === 'high' || e.unread).slice(0, 3);
              if (!urgent.length) return (
                <div style={{ flex: '2 1 300px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--c-muted)', textAlign: 'center' }}>
                    {installations.some((i) => i.catalogId?.includes('email') || i.catalogId?.includes('imap'))
                      ? 'No urgent or unread emails in snapshot. Sync to refresh.'
                      : 'No email connector installed. IT Admin can add one under Connectors.'}
                  </p>
                </div>
              );
              return (
                <div style={{ flex: '2 1 300px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {urgent.map((email) => (
                    <div key={email.id} style={{
                      display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                      padding: '0.45rem 0.7rem', borderRadius: 7,
                      background: email.priority === 'high' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${email.priority === 'high' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
                      borderLeft: `3px solid ${email.priority === 'high' ? '#ef4444' : 'rgba(124,58,237,0.6)'}`,
                    }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{email.priority === 'high' ? '🔴' : '✉️'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.83rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.subject}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>From: {email.from} · {new Date(email.at).toLocaleString()}</div>
                      </div>
                      {email.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa', flexShrink: 0, marginTop: 4 }} aria-label="unread" />}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/app/org-data" style={{ fontSize: '0.78rem', padding: '0.22rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--c-muted)', textDecoration: 'none' }}>View all emails</Link>
            <Link href="/app/org-data" style={{ fontSize: '0.78rem', padding: '0.22rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--c-muted)', textDecoration: 'none' }}>Reports &amp; downloads</Link>
            <Link href="/app/inbox" style={{ fontSize: '0.78rem', padding: '0.22rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--c-muted)', textDecoration: 'none' }}>Inbox companion</Link>
            {isOwner ? <Link href="/app/connectors" style={{ fontSize: '0.78rem', padding: '0.22rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--c-muted)', textDecoration: 'none' }}>Manage connectors</Link> : null}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Enterprise Pulse</h2>
            <div className={styles.tabs}>
              {(
                [
                  ['month', 'This Month'],
                  ['quarter', 'This Quarter'],
                  ['year', 'This Year'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={range === key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                  onClick={() => setRange(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.chartTall} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {synced
              ? <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                  Historical trend tracking coming soon. Sync daily to build your baseline.
                </p>
              : <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                  Sync a connector to start recording pulse data.
                </p>
            }
          </div>
        </section>

        <section className={styles.aiCard}>
          <span className={styles.aiBadge}>Ellinea AI</span>
          <h3>AI Insights</h3>
          <p>
            {synced
              ? summary!.briefHighlight
              : variant === 'admin'
                ? 'Invite users from IT Admin, then sync your first connector to unlock live insights.'
                : 'Ask your IT admin to sync the first connector so Ellinea can brief you.'}
          </p>
          <Link href="/app/ellinea" className={styles.aiBtn}>
            View Full Insights
          </Link>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Notifications</h2>
            <Link href="/app/notifications" className={styles.primaryLink}>
              Open →
            </Link>
          </div>
          {timeline.length > 0 ? (
            <ul className={styles.list}>
              {timeline.slice(0, 4).map((item, i) => (
                <li key={item.title}>
                  <span
                    className={styles.dot}
                    style={{
                      background: [chartColors.GREEN, chartColors.AMBER, chartColors.RED, chartColors.BLUE][i % 4],
                    }}
                  />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.lede} style={{ padding: '0.75rem 0' }}>
              {synced ? 'No recent events from your connected systems.' : 'Sync a connector to see live event notifications here.'}
            </p>
          )}
        </section>
      </div>

      <div className={styles.gridAdminBottom}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Enterprise objects</h2>
          </div>
          {synced && summary?.model?.objects?.length ? (
            <ul className={styles.uemObjects}>
              {summary.model.objects.slice(0, 6).map((obj) => (
                <li key={obj.id}>
                  <span className={styles.uemKind}>{obj.kind}</span>
                  <div>
                    <strong>{obj.name}</strong>
                    <p>{obj.status || 'synced'}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.lede}>
              Sync a connector to populate branches, people, tasks, and other UEM objects.
            </p>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Tasks Overview</h2>
          </div>
          {donut.length > 0 ? (
            <div className={styles.donutWrap}>
              <div className={styles.chartDonut}>
                <DonutStatus segments={donut} center={String(totalTasks)} />
              </div>
              <div className={styles.legend}>
                {donut.map((d) => (
                  <div key={d.name} className={styles.legendItem}>
                    <span className={styles.dot} style={{ background: d.color, marginTop: 0 }} />
                    {d.name}
                    <strong>{d.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className={styles.lede} style={{ padding: '0.75rem 0' }}>
              {synced ? 'No open decisions or alerts.' : 'Sync a connector to see tasks.'}
            </p>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Enterprise Timeline</h2>
            <Link href="/app/timeline" className={styles.primaryLink}>
              Open →
            </Link>
          </div>
          {timeline.length > 0 ? (
            <ul className={styles.list}>
              {timeline.map((item) => (
                <li key={`act-${item.title}`}>
                  <span className={styles.dot} style={{ background: chartColors.VIOLET }} />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className={styles.time}>
                    {summary?.syncedAt
                      ? new Date(summary.syncedAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.lede} style={{ padding: '0.75rem 0' }}>
              {synced ? 'No timeline events in the current snapshot.' : 'Sync a connector to populate the enterprise timeline.'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function ClientOverview({
  name,
  summary,
  synced,
  variant,
}: {
  name: string;
  summary: EnterpriseSummaryDto | null;
  synced: boolean;
  variant: WorkHomeVariant;
}) {
  const health = synced ? summary!.healthScore : 0;
  const alerts = synced ? summary!.openAlerts : 0;
  const decisions = synced ? summary!.openDecisions : 0;
  const systems = synced ? summary!.connectedSystems : 0;

  // No synthetic chart data — all charts require real time-series history.
  // Only the calendar and real DB values are shown.

  // Ops donut: real counts only — no Math.max(1,...) floors, no hardcoded baseline of 20.
  // Show empty donut with message when there are no real alerts/decisions.
  const opsSegments = synced && (alerts > 0 || decisions > 0) ? [
    ...(alerts > 0     ? [{ name: 'Critical', value: alerts,    color: chartColors.RED   }] : []),
    ...(decisions > 0  ? [{ name: 'Decisions', value: decisions, color: chartColors.AMBER }] : []),
  ] : [];

  // Calendar helpers
  const _now = new Date();
  const monthName = _now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const today = _now.getDate();
  const firstDow = new Date(_now.getFullYear(), _now.getMonth(), 1).getDay();
  const daysInMonth = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
  const calCells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const title =
    variant === 'executive'
      ? 'Executive overview'
      : variant === 'manager'
        ? 'Branch & team view'
        : 'What needs you';
  const eyebrow =
    variant === 'executive'
      ? 'Executive'
      : variant === 'manager'
        ? 'Manager'
        : 'Work Console';
  const lede = synced
    ? variant === 'executive'
      ? 'Health, decisions, and Ellinea brief for org-wide direction.'
      : variant === 'manager'
        ? 'Team pressure, open decisions, and branch attention from the latest sync.'
        : 'Tasks and alerts that need your attention — Ask Ellinea when stuck.'
    : 'Welcome back — sync is pending. Ellinea lights up when IT connects systems.';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>
            {title}
            {name ? `, ${name}` : ''}
          </h1>
          <p className={styles.lede}>{lede}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
          <Link href="/app/approvals" className={styles.ghostBtn}>
            Approvals
          </Link>
          <Link href="/app/notifications" className={styles.ghostBtn}>
            Notifications
          </Link>
          <Link href="/app/timeline" className={styles.ghostBtn}>
            Timeline
          </Link>
        </div>
      </header>

      {!synced ? (
        <section className={styles.emptyCallout} role="status">
          <div>
            <strong>Waiting on connectors</strong>
            <p>Your IT Admin syncs systems under Connectors. Meanwhile you can still open Ellinea and Approvals.</p>
          </div>
          <Link href="/app/ellinea" className={styles.aiBtn}>
            Ask Ellinea
          </Link>
        </section>
      ) : null}

      {/* ── 19.5 Staff dashboard: personalised task list, team updates, quick shortcuts ── */}
      {(variant === 'member') && (
        <section style={{ marginBottom: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
          {/* Personalised task list */}
          <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-line)', borderRadius: 12, padding: '0.85rem 0.95rem' }}>
            <div className={styles.panelLabel}>My tasks</div>
            {synced && (decisions > 0 || alerts > 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.35rem' }}>
                {decisions > 0 && (
                  <Link href="/app/approvals" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.55rem', borderRadius: 7, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Open decisions</span>
                    <span style={{ fontWeight: 800, color: '#60a5fa' }}>{decisions}</span>
                  </Link>
                )}
                {alerts > 0 && (
                  <Link href="/app/notifications" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.55rem', borderRadius: 7, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Open alerts</span>
                    <span style={{ fontWeight: 800, color: '#f87171' }}>{alerts}</span>
                  </Link>
                )}
              </div>
            ) : (
              <p style={{ margin: '0.35rem 0 0', color: 'var(--c-muted)', fontSize: '0.8rem' }}>
                {synced ? 'No tasks pending. Check back after the next sync.' : 'Sync pending — your IT Admin connects systems.'}
              </p>
            )}
          </div>
          {/* Team updates from audit log + quick shortcuts */}
          <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-line)', borderRadius: 12, padding: '0.85rem 0.95rem' }}>
            <div className={styles.panelLabel}>Quick access</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
              {[
                { href: '/app/ellinea',      label: 'Ask Ellinea' },
                { href: '/app/approvals',    label: 'Approvals' },
                { href: '/app/notifications',label: 'Notifications' },
                { href: '/app/search',       label: 'Enterprise search' },
                { href: '/app/timeline',     label: 'Timeline' },
                { href: '/app/profile',      label: 'My profile' },
              ].map(item => (
                <Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', padding: '0.32rem 0.55rem', borderRadius: 6, border: '1px solid var(--c-line)', background: 'rgba(255,255,255,0.02)', fontSize: '0.8rem', fontWeight: 600, color: '#c5cddb', textDecoration: 'none' }}>
                  {item.label} →
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className={styles.gridClientTop}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Intelligence Pulse</h2>
          </div>
          <div className={styles.metricRow}>
            <strong>{synced ? health : '—'}</strong>
            <span className={styles.badge}>enterprise health</span>
          </div>
          {!synced && (
            <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', marginTop: '0.5rem' }}>
              Sync a connector to see live health data.
            </p>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Operational Status</h2>
          </div>
          <div className={styles.donutWrap}>
            <div className={styles.chartDonut}>
              <DonutStatus segments={opsSegments} center={synced ? `${health}%` : '—'} />
            </div>
            <div className={styles.statusRow}>
              {opsSegments.length > 0 ? opsSegments.map((s) => (
                <div key={s.name} className={styles.statusItem}>
                  <span className={styles.dot} style={{ background: s.color, marginTop: 0 }} />
                  {s.name}
                  <strong>{s.value}</strong>
                </div>
              )) : (
                <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem' }}>
                  {synced ? 'No open alerts or decisions.' : 'Awaiting sync.'}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Decision Flow</h2>
          </div>
          <div className={styles.metricRow}>
            <strong>{synced ? decisions : '—'}</strong>
            <span className={styles.badge}>open decisions</span>
          </div>
          {!synced && (
            <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', marginTop: '0.5rem' }}>
              Sync a connector to see live decisions.
            </p>
          )}
        </section>
      </div>

      <div className={styles.gridClientMid}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Department Performance</h2>
          </div>
          {synced && summary?.model?.objects && summary.model.objects.filter(o => o.kind === 'department').length > 0 ? (
            <div className={styles.bars}>
              {summary.model.objects
                .filter(o => o.kind === 'department')
                .slice(0, 8)
                .map((dept) => (
                  <div key={dept.id} className={styles.barRow}>
                    <span>{dept.name}</span>
                    <div className={styles.track}>
                      <div className={styles.fill} style={{ width: dept.status === 'active' ? '100%' : '60%' }} />
                    </div>
                    <em>{dept.status || '—'}</em>
                  </div>
                ))}
            </div>
          ) : (
            <p className={styles.lede} style={{ padding: '0.5rem 0' }}>
              {synced
                ? 'No department-level data in the current snapshot. Configure your connector to return department objects.'
                : 'Sync a connector to see per-department data.'}
            </p>
          )}
        </section>

        <section className={styles.aiCard}>
          <span className={styles.aiBadge}>Ellinea AI</span>
          <h3>Hello, {name}</h3>
          <p>
            {synced
              ? summary!.briefHighlight
              : 'You have a clear path: once connectors sync, Ellinea will surface risks, briefs, and recommended actions here.'}
          </p>
          <Link href="/app/ellinea" className={styles.aiBtn}>
            Ask Ellinea
          </Link>
          <svg className={styles.robot} viewBox="0 0 120 120" aria-hidden>
            <defs>
              <linearGradient id="bot" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <rect x="28" y="38" width="64" height="52" rx="16" fill="url(#bot)" opacity="0.95" />
            <circle cx="48" cy="58" r="6" fill="#0b0e14" />
            <circle cx="72" cy="58" r="6" fill="#0b0e14" />
            <rect x="46" y="72" width="28" height="6" rx="3" fill="#0b0e14" opacity="0.55" />
            <rect x="52" y="22" width="16" height="16" rx="4" fill="#a78bfa" />
            <circle cx="60" cy="18" r="4" fill="#60a5fa" />
          </svg>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{monthName}</h2>
          </div>
          <div className={styles.calendar}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className={styles.calHead}>
                {d}
              </div>
            ))}
            {calCells.map((day, i) =>
              day === null ? (
                <div key={`e-${i}`} className={`${styles.calDay} ${styles.calEmpty}`} />
              ) : (
                <div key={day} className={day === today ? `${styles.calDay} ${styles.calToday}` : styles.calDay}>
                  {day}
                </div>
              ),
            )}
          </div>
        </section>
      </div>

      <div className={styles.quickBar}>
        <Link href="/app/ellinea" className={styles.quickLink}>
          Ask Ellinea
        </Link>
        <Link href="/app/approvals" className={styles.quickLink}>
          Approvals ({synced ? decisions : '—'})
        </Link>
        <Link href="/app/notifications" className={styles.quickLink}>
          Alerts ({synced ? alerts : '—'})
        </Link>
        <Link href="/app/search" className={styles.quickLink}>
          Search
        </Link>
        <Link href="/app/profile" className={styles.quickLink}>
          Profile
        </Link>
        <span className={styles.quickLink}>Systems: {synced ? systems : 0}</span>
      </div>
    </div>
  );
}

export default function CommandCenterPage() {
  const [name, setName] = useState('there');
  const [role, setRole] = useState('member');
  const [variant, setVariant] = useState<WorkHomeVariant>('member');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPlatform, setIsPlatform] = useState(false);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [installations, setInstallations] = useState<ConnectorInstallationDto[]>([]);
  const [connectorHealth, setConnectorHealth] = useState<ConnectorHealthDto | null>(null);
  const [ruleHits, setRuleHits] = useState<RuleHit[]>([]);
  const [correlationGroups, setCorrelationGroups] = useState<AlertCorrelationGroupDto[]>([]);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);

  useEffect(() => {
    const s = getSession();
    const first = s?.user.fullName?.split(' ')[0];
    if (first) setName(first);
    setRole(s?.user.role || 'member');
    setVariant(workHomeVariant(s?.user.role));
    setIsAdmin(isOrgAdminRole(s?.user.role));
    setIsPlatform(Boolean(s?.isPlatformAdmin));
    setUiPrefs(readUiPrefs());
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent<UiPrefs>).detail;
      if (detail) setUiPrefs(detail);
    };
    window.addEventListener(UI_PREFS_EVENT, onPrefs);
    fetchEnterpriseSummary()
      .then((summary) => {
        setSummary(summary);
        if (s?.organization.id && (isOrgAdminRole(s.user.role) || s.isPlatformAdmin)) {
          const rules = readBusinessRules(s.organization.id);
          setRuleHits(
            evaluateBusinessRules(rules, {
              openAlerts: summary.openAlerts || 0,
              openDecisions: summary.openDecisions || 0,
              healthScore: summary.healthScore || 0,
              synced: summary.status === 'synced',
            }).filter((h) => {
              const rule = rules.find((r) => r.id === h.ruleId);
              return rule?.then === 'flag_overview';
            }),
          );
        }
      })
      .catch(() => setSummary(null));
    if (isOrgAdminRole(s?.user.role) || s?.isPlatformAdmin) {
      listInstallations()
        .then(setInstallations)
        .catch(() => setInstallations([]));
      fetchAlertCorrelations()
        .then((res) => setCorrelationGroups(res.correlationGroups))
        .catch(() => setCorrelationGroups([]));
      fetchConnectorHealth()
        .then(setConnectorHealth)
        .catch(() => setConnectorHealth(null));
    }
    return () => window.removeEventListener(UI_PREFS_EVENT, onPrefs);
  }, []);

  const synced = summary?.status === 'synced';
  const showAdmin = isAdmin || isPlatform;

  if (showAdmin) {
    return (
      <AdminOverview
        name={name}
        role={role}
        summary={summary}
        synced={synced}
        variant={variant}
        uiPrefs={uiPrefs}
        installations={installations}
        connectorHealth={connectorHealth}
        ruleHits={ruleHits}
        correlationGroups={correlationGroups}
      />
    );
  }

  return <ClientOverview name={name} summary={summary} synced={synced} variant={variant} />;
}
