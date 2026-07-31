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
import { fetchEnterpriseSummary, getSession, type EnterpriseSummaryDto } from '@/lib/api';
import styles from './command.module.css';

function AdminOverview({
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
  const systems = synced ? summary!.connectedSystems : 0;
  const alerts = synced ? summary!.openAlerts : 0;
  const decisions = synced ? summary!.openDecisions : 0;
  const [range, setRange] = useState<'month' | 'quarter' | 'year'>('month');

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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Work Console · Org command + IT</p>
          <h1>Welcome back, {name}</h1>
          <p className={styles.lede}>
            {synced
              ? 'Live enterprise snapshot from your connectors.'
              : 'Sync Demo JSON Systems in Connectors to unlock live KPIs.'}
          </p>
        </div>
      </header>

      <div className={styles.kpis}>
        <article className={styles.kpi}>
          <span>Enterprise Health</span>
          <strong>{synced ? String(health) : '—'}</strong>
          <em className={synced ? styles.pos : undefined}>{synced ? 'Live composite' : 'Awaiting sync'}</em>
          <div className={styles.spark}>
            <Sparkline data={sparks.health} color={chartColors.BLUE} />
          </div>
        </article>
        <article className={styles.kpi}>
          <span>Connected Systems</span>
          <strong>{synced ? String(systems) : '0'}</strong>
          <em className={synced ? styles.warn : undefined}>{synced ? 'Synced' : 'Connect to unlock'}</em>
          <div className={styles.spark}>
            <Sparkline data={sparks.systems} color={chartColors.VIOLET} />
          </div>
        </article>
        <article className={styles.kpi}>
          <span>Open Decisions</span>
          <strong>{synced ? String(decisions) : '—'}</strong>
          <em>{synced ? 'In queue' : '—'}</em>
          <div className={styles.spark}>
            <Sparkline data={sparks.decisions} color={chartColors.BLUE} />
          </div>
        </article>
        <article className={styles.kpi}>
          <span>Ellinea Status</span>
          <strong>Ready</strong>
          <em className={styles.pos}>Standing by</em>
          <div className={styles.spark}>
            <Sparkline data={sparks.ready} color={chartColors.GREEN} />
          </div>
        </article>
      </div>

      {synced && summary?.model?.counts ? (
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
    variant === 'executive' ? 'Executive overview' : variant === 'manager' ? 'Branch & team view' : 'What needs you';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Enterprise Overview</p>
          <h1>{title}</h1>
          <p className={styles.lede}>
            {synced
              ? 'Real-time overview of your organization from connected systems.'
              : 'Welcome back — sync is pending. Ellinea is ready when your IT admin connects systems.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.ghostBtn}>Add Widget</span>
          <span className={styles.ghostBtn}>Share</span>
        </div>
      </header>

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
        <Link href="/app" className={styles.quickLink}>
          View brief
        </Link>
        <Link href="/app/profile" className={styles.quickLink}>
          Open profile
        </Link>
        <span className={styles.quickLink}>Systems: {synced ? systems : 0}</span>
        <span className={styles.quickLink}>Alerts: {synced ? alerts : '—'}</span>
      </div>
    </div>
  );
}

export default function CommandCenterPage() {
  const [name, setName] = useState('there');
  const [variant, setVariant] = useState<WorkHomeVariant>('member');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPlatform, setIsPlatform] = useState(false);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);

  useEffect(() => {
    const s = getSession();
    const first = s?.user.fullName?.split(' ')[0];
    if (first) setName(first);
    setVariant(workHomeVariant(s?.user.role));
    setIsAdmin(isOrgAdminRole(s?.user.role));
    setIsPlatform(Boolean(s?.isPlatformAdmin));
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const synced = summary?.status === 'synced';
  const showAdmin = isAdmin || isPlatform;

  if (showAdmin) {
    return <AdminOverview name={name} summary={summary} synced={synced} variant={variant} />;
  }

  return <ClientOverview name={name} summary={summary} synced={synced} variant={variant} />;
}
