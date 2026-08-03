'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isOrgAdminRole, workHomeVariant, type WorkHomeVariant } from '@ellines-eip/shared';
import {
  AreaPulse,
  BarWeek,
  DonutStatus,
  Sparkline,
  chartColors,
  pulseSeries,
  sparkSeries,
  weekSeries,
} from '@/components/dashboard/charts';
import { fetchEnterpriseSummary, getSession, listInstallations, fetchAlertCorrelations, fetchAlertRootCause, type ConnectorInstallationDto, type EnterpriseSummaryDto, type AlertCorrelationGroupDto } from '@/lib/api';
import { evaluateBusinessRules, readBusinessRules, type RuleHit } from '@/lib/business-rules';
import { DEFAULT_UI_PREFS, readUiPrefs, UI_PREFS_EVENT, type UiPrefs } from '@/lib/ui-prefs';
import styles from './command.module.css';

function AdminOverview({
  name,
  role,
  summary,
  synced,
  variant,
  uiPrefs,
  installations,
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

  const pulse = useMemo(() => pulseSeries(synced ? health : 42), [synced, health]);
  const sparks = useMemo(
    () => ({
      health: sparkSeries(synced ? health : 40, 9),
      systems: sparkSeries(synced ? systems * 18 + 30 : 28, 9),
      decisions: sparkSeries(synced ? decisions * 10 + 35 : 32, 9),
      ready: sparkSeries(70, 9),
    }),
    [synced, health, systems, decisions],
  );

  const timeline =
    synced && summary?.timeline?.length
      ? summary.timeline
      : [
          {
            title: 'Access layers online',
            detail: 'Work Console, Org IT Admin, and Platform Super Admin are separated by role.',
          },
          {
            title: 'Next: sync a connector',
            detail: 'Open Connectors and run Sync now on Demo JSON Systems.',
          },
        ];

  const donut = [
    { name: 'Decisions', value: Math.max(1, decisions), color: chartColors.GREEN },
    { name: 'Alerts', value: Math.max(1, alerts), color: chartColors.BLUE },
    { name: 'Standing by', value: Math.max(1, 8 - alerts), color: chartColors.AMBER },
  ];
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
                : 'IT Admin view — open Connectors and sync Demo JSON Systems to unlock live KPIs.'}
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
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f8f8ff', borderRadius: '0.35rem', border: '1px solid #ede9fe', fontSize: '0.84rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                <strong style={{ color: '#6f2d8d' }}>Ellinea root-cause:</strong>
                <div style={{ marginTop: '0.3rem' }}>{rootCause}</div>
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
                ? 'Ask IT (or open Connectors yourself) to sync Demo JSON Systems — then Ellinea and KPIs light up.'
                : 'Open Connectors → install or pick Demo JSON Systems → Sync now.'}
            </p>
          </div>
          <Link href="/app/connectors" className={styles.aiBtn}>
            Open Connectors
          </Link>
        </section>
      ) : null}

      {installations.length ? (
        <section className={styles.healthStrip} aria-label="Connector health">
          <div className={styles.panelLabel}>Connector health</div>
          <div className={styles.healthChips}>
            {installations.slice(0, 8).map((inst) => (
              <Link
                key={inst.id}
                href="/app/connectors"
                className={styles.healthChip}
                data-status={inst.status || 'idle'}
              >
                <strong>{inst.displayName}</strong>
                <span>{inst.status || 'idle'}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.kpis}>
        <article className={styles.kpi}>
          <span>Enterprise Health</span>
          <strong>{synced ? String(health) : '—'}</strong>
          <em className={synced ? styles.pos : undefined}>{synced ? 'Live composite' : 'Awaiting sync'}</em>
          {uiPrefs.showSparklines ? (
            <div className={styles.spark}>
              <Sparkline data={sparks.health} color={chartColors.BLUE} />
            </div>
          ) : null}
        </article>
        <article className={styles.kpi}>
          <span>Connected Systems</span>
          <strong>{synced ? String(systems) : '0'}</strong>
          <em className={synced ? styles.warn : undefined}>{synced ? 'Synced' : 'Connect to unlock'}</em>
          {uiPrefs.showSparklines ? (
            <div className={styles.spark}>
              <Sparkline data={sparks.systems} color={chartColors.VIOLET} />
            </div>
          ) : null}
        </article>
        <Link href="/app/approvals" className={styles.kpi} style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>Open Decisions</span>
          <strong>{synced ? String(decisions) : '—'}</strong>
          <em>{synced ? 'Open Approvals →' : '—'}</em>
          {uiPrefs.showSparklines ? (
            <div className={styles.spark}>
              <Sparkline data={sparks.decisions} color={chartColors.BLUE} />
            </div>
          ) : null}
        </Link>
        <Link href="/app/ellinea" className={styles.kpi} style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>Ellinea Status</span>
          <strong>Ready</strong>
          <em className={styles.pos}>Ask Ellinea →</em>
          {uiPrefs.showSparklines ? (
            <div className={styles.spark}>
              <Sparkline data={sparks.ready} color={chartColors.GREEN} />
            </div>
          ) : null}
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

      <div className={styles.gridAdmin}>
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
          <div className={styles.chartTall}>
            <AreaPulse data={pulse} color={range === 'year' ? chartColors.VIOLET : chartColors.BLUE} />
          </div>
        </section>

        <section className={styles.aiCard}>
          <span className={styles.aiBadge}>Ellinea AI</span>
          <h3>AI Insights</h3>
          <p>
            {synced
              ? summary!.briefHighlight
              : variant === 'admin'
                ? 'Invite users from IT Admin, then sync Demo JSON Systems to unlock live insights.'
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
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Enterprise Timeline</h2>
            <Link href="/app/timeline" className={styles.primaryLink}>
              Open →
            </Link>
          </div>
          <ul className={styles.list}>
            {timeline.map((item) => (
              <li key={`act-${item.title}`}>
                <span className={styles.dot} style={{ background: chartColors.VIOLET }} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className={styles.time}>
                  {synced && summary?.syncedAt
                    ? new Date(summary.syncedAt).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
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
  const health = synced ? summary!.healthScore : 62;
  const alerts = synced ? summary!.openAlerts : 2;
  const decisions = synced ? summary!.openDecisions : 3;
  const systems = synced ? summary!.connectedSystems : 0;

  const bars = useMemo(() => weekSeries(health), [health]);
  const cash = useMemo(() => pulseSeries(Math.max(40, health - 8)), [health]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const calCells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const depts = [
    { label: 'Finance', pct: Math.min(95, Math.round(health * 0.95)) },
    { label: 'Sales', pct: Math.min(92, Math.round(health * 0.88)) },
    { label: 'Operations', pct: Math.min(90, Math.round(health * 0.82)) },
    { label: 'HR', pct: Math.min(88, Math.round(health * 0.76)) },
    { label: 'IT', pct: Math.min(86, Math.round(health * 0.72)) },
  ];

  const opsSegments = [
    { name: 'Critical', value: Math.max(1, Math.min(4, alerts)), color: chartColors.RED },
    { name: 'Warning', value: Math.max(2, Math.min(8, decisions)), color: chartColors.AMBER },
    { name: 'Normal', value: Math.max(8, 20 - alerts - decisions), color: chartColors.GREEN },
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

      <div className={styles.gridClientTop}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Intelligence Pulse</h2>
          </div>
          <div className={styles.metricRow}>
            <strong>{synced ? health : '—'}</strong>
            <span className={`${styles.badge} ${styles.pos}`}>+{synced ? Math.round(health / 8) : 0}% health</span>
          </div>
          <div className={styles.chartMed}>
            <BarWeek data={bars} />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Operational Status</h2>
          </div>
          <div className={styles.donutWrap}>
            <div className={styles.chartDonut}>
              <DonutStatus segments={opsSegments} center={`${synced ? health : 92}%`} />
            </div>
            <div className={styles.statusRow}>
              {opsSegments.map((s) => (
                <div key={s.name} className={styles.statusItem}>
                  <span className={styles.dot} style={{ background: s.color, marginTop: 0 }} />
                  {s.name}
                  <strong>{s.value}</strong>
                </div>
              ))}
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
          <div className={styles.chartMed}>
            <AreaPulse data={cash} color={chartColors.BLUE} />
          </div>
        </section>
      </div>

      <div className={styles.gridClientMid}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Department Performance</h2>
          </div>
          <div className={styles.bars}>
            {depts.map((d) => (
              <div key={d.label} className={styles.barRow}>
                <span>{d.label}</span>
                <div className={styles.track}>
                  <div className={styles.fill} style={{ width: `${d.pct}%` }} />
                </div>
                <em>{d.pct}%</em>
              </div>
            ))}
          </div>
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
        ruleHits={ruleHits}
        correlationGroups={correlationGroups}
      />
    );
  }

  return <ClientOverview name={name} summary={summary} synced={synced} variant={variant} />;
}
