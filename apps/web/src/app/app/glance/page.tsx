'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  buildEllineaRecommendations,
  type EllineaRecommendation,
} from '@/lib/ellinea-engine';
import {
  askEllineaApi,
  fetchEllineaMemory,
  fetchEnterpriseSummary,
  fetchOrganizationSources,
  getSession,
  listReportsApi,
  type EnterpriseSummaryDto,
  type EllineaMemoryNoteDto,
  type ScheduledReportDto,
  type OrganizationSourceGraphDto,
} from '@/lib/api';
import {
  ConnectorTable,
  WebsiteSummaryCard,
} from '@/components/source-graph/SourceModules';
import {
  buildReportPreview,
  readScheduledReports,
  type ScheduledReport,
} from '@/lib/scheduled-reports';
import { DEFAULT_UI_PREFS, readUiPrefs, type UiPrefs } from '@/lib/ui-prefs';
import styles from '../command.module.css';

type TrendDir = 'up' | 'down' | 'same' | 'unknown';

function trendArrow(dir: TrendDir, isPositive: boolean) {
  if (dir === 'same') return <span style={{ color: '#64748b', fontSize: '0.75rem' }}>→</span>;
  const up = dir === 'up';
  const good = up === isPositive;
  return (
    <span style={{ color: good ? '#10b981' : '#ef4444', fontSize: '0.75rem', fontWeight: 700 }}>
      {up ? '▲' : '▼'}
    </span>
  );
}

const PREV_KEY = 'eip_glance_prev';
type PrevSnapshot = {
  /** null = health was not reported, so it cannot be trended. */
  healthScore: number | null;
  openAlerts: number;
  openDecisions: number;
  connectedSystems: number;
  at: string;
};

function readPrev(): PrevSnapshot | null {
  try { return JSON.parse(localStorage.getItem(PREV_KEY) || 'null'); } catch { return null; }
}
function savePrev(snap: PrevSnapshot) {
  localStorage.setItem(PREV_KEY, JSON.stringify(snap));
}

/**
 * Trend between two values. `null`/undefined on either side means the value is
 * unknown, which is reported as 'unknown' — never coerced to 0, which would
 * fabricate a movement from nothing.
 */
function calcTrend(current: number | null | undefined, prev: number | null | undefined): TrendDir {
  if (current === null || current === undefined) return 'unknown';
  if (prev === null || prev === undefined) return 'unknown';
  if (prev === current) return 'same';
  return current > prev ? 'up' : 'down';
}

export default function GlanceCompanionPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [prev, setPrev] = useState<PrevSnapshot | null>(null);
  const [preview, setPreview] = useState('');
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [serverReports, setServerReports] = useState<ScheduledReportDto[]>([]);
  const [recs, setRecs] = useState<EllineaRecommendation[]>([]);
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [briefBusy, setBriefBusy] = useState(false);
  const [memory, setMemory] = useState<EllineaMemoryNoteDto[]>([]);
  // The real source graph: website, business systems, connectors. Loaded from the
  // same endpoint every other surface uses, so the Command Center cannot show a
  // connector count where a system should be.
  const [sources, setSources] = useState<OrganizationSourceGraphDto | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function loadData(s: { organization: { id: string; name: string }; user: { role: string } }) {
    setRefreshing(true);
    const prevSnap = readPrev();
    if (prevSnap) setPrev(prevSnap);

    Promise.all([
      fetchEnterpriseSummary(),
      fetchEllineaMemory().catch(() => [] as EllineaMemoryNoteDto[]),
      listReportsApi().catch(() => [] as ScheduledReportDto[]),
      // A failure here must not blank the whole Command Center, so it degrades
      // to "no source data" rather than taking the KPI grid down with it.
      fetchOrganizationSources().catch(() => null),
    ])
      .then(([snap, mem, reports, graph]) => {
        setSummary(snap);
        setMemory(mem);
        setServerReports(reports);
        setSources(graph);
        setLastRefresh(new Date());
        const synced = snap.status === 'synced';

        // Save current as prev for next load
        if (synced) {
          savePrev({
            healthScore: snap.healthScore,
            openAlerts: snap.openAlerts,
            openDecisions: snap.openDecisions,
            connectedSystems: snap.connectedSystems,
            at: new Date().toISOString(),
          });
        }

        setPreview(
          buildReportPreview({
            orgName: s.organization.name,
            healthScore: synced ? snap.healthScore : null,
            openAlerts: snap.openAlerts || 0,
            openDecisions: snap.openDecisions || 0,
            connectedSystems: snap.connectedSystems || 0,
            briefHighlight: synced
              ? snap.briefHighlight
              : 'No live snapshot yet — sync connectors first.',
          }),
        );

        const ui = readUiPrefs();
        if (ui.ellineaShowRecommendations !== false) {
          setRecs(
            buildEllineaRecommendations(synced ? snap : null, {
              role: s.user.role,
              useRoleContext: ui.ellineaRoleContext !== false,
            }).slice(0, 4),
          );
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load glance'))
      .finally(() => { setRefreshing(false); setLoading(false); });
  }

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setOrgAdmin(isOrgAdminRole(s.user.role));
    setRole(s.user.role);
    setOrgName(s.organization.name);
    setPrefs(readUiPrefs());
    setSchedules(readScheduledReports(s.organization.id));
    loadData(s);

    // Auto-refresh every 2 minutes
    refreshTimer.current = setInterval(() => loadData(s), 2 * 60_000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, []);

  const synced = summary?.status === 'synced';
  const enabledSchedules = [
    ...serverReports.filter((r) => r.enabled),
    ...schedules.filter((r) => r.enabled && !serverReports.find((s) => s.id === r.id)),
  ].slice(0, 5);

  async function generateBrief() {
    if (!summary) return;
    setBriefBusy(true);
    setBriefText('');
    try {
      const res = await askEllineaApi({
        question: 'Generate my executive daily brief with key metrics, alerts, and recommended actions for today.',
        summary,
        memory,
        templateAnswer: `Daily brief for ${orgName}: Health ${summary.healthScore}/100, ${summary.openAlerts} alert(s), ${summary.openDecisions} decision(s), ${summary.connectedSystems} system(s). ${summary.briefHighlight}`,
        role,
        organizationName: orgName,
      });
      setBriefText(res.answer);
    } catch (err) {
      setBriefText(err instanceof Error ? err.message : 'Brief generation failed');
    } finally {
      setBriefBusy(false);
    }
  }

  const kpis = [
    {
      label: 'Health',
      value: synced ? summary!.healthScore : null,
      unit: '/100',
      trend: calcTrend(summary?.healthScore, prev?.healthScore),
      positive: true, // higher is better
      href: '/app',
    },
    {
      label: 'Alerts',
      value: synced ? summary!.openAlerts : null,
      unit: '',
      trend: calcTrend(summary?.openAlerts ?? 0, prev?.openAlerts),
      positive: false, // lower is better
      href: '/app/notifications',
    },
    {
      label: 'Decisions',
      value: synced ? summary!.openDecisions : null,
      unit: '',
      trend: calcTrend(summary?.openDecisions ?? 0, prev?.openDecisions),
      positive: false,
      href: '/app/approvals',
    },
    {
      label: 'Systems',
      value: synced ? summary!.connectedSystems : null,
      unit: '',
      trend: calcTrend(summary?.connectedSystems ?? 0, prev?.connectedSystems),
      positive: true,
      href: '/app/connectors',
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mobile Work Companion · Glance</p>
          <h1>Live glance</h1>
          <p className={styles.lede}>
            Real-time enterprise KPIs with trend indicators. Auto-refreshes every 2 minutes. Same
            snapshot as Overview — no second System of Record.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => { const s = getSession(); if (s) loadData(s); }}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : '↺ Refresh'}
          </button>
          <button
            type="button"
            className={styles.aiBtn}
            onClick={generateBrief}
            disabled={briefBusy || !synced}
          >
            {briefBusy ? 'Generating…' : '✦ Daily Brief'}
          </button>
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
        </div>
      </header>

      {error ? <p className={styles.lede} style={{ color: '#f87171' }}>{error}</p> : null}

      {/* ── Connected Website / Connected Systems ──────────────────────────
          Two separate cards because they are two separate facts. The website
          card shows only measured technical facts; the systems card shows the
          real business systems and the resources each one actually exposes.
          Neither is derived from a connector count. */}
      {sources ? (
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            marginBottom: '1rem',
          }}
        >
          <div>
            <WebsiteSummaryCard website={sources.website} />
            <Link
              href="/app/connected-website"
              className={styles.ghostBtn}
              style={{ marginTop: '0.5rem', display: 'inline-block' }}
            >
              Open Connected Website
            </Link>
          </div>

          <section
            style={{
              border: '1px solid rgba(148,163,184,0.18)',
              borderRadius: 10,
              padding: '1rem',
              background: 'rgba(15,23,42,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--c-muted)',
                  }}
                >
                  Connected systems
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>
                  {sources.businessSystems.length}{' '}
                  {sources.businessSystems.length === 1 ? 'system' : 'systems'} connected
                </div>
              </div>
              <Link href="/app/connectors/systems" className={styles.ghostBtn}>
                Open
              </Link>
            </div>

            {sources.businessSystems.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--c-muted)', lineHeight: 1.6 }}>
                No business system is connected. EIP does not show a placeholder system, and does
                not list modules this organisation may or may not have.
              </p>
            ) : (
              sources.businessSystems.map((sys) => (
                <div
                  key={sys.id}
                  style={{
                    borderTop: '1px solid rgba(148,163,184,0.12)',
                    paddingTop: '0.6rem',
                    marginTop: '0.6rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      alignItems: 'baseline',
                    }}
                  >
                    <strong style={{ fontSize: 13, color: '#f8fafc' }}>{sys.name}</strong>
                    <span style={{ fontSize: 10, fontWeight: 700, color: sys.status === 'CONNECTED' ? '#86efac' : '#94a3b8' }}>
                      {sys.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 3 }}>
                    {sys.statusEvidence}
                  </div>
                  {/* Only resources the source actually returned are listed. */}
                  {sys.resources.length ? (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {sys.resources.map((r) => (
                        <span
                          key={r.id}
                          style={{
                            fontSize: 10,
                            padding: '3px 8px',
                            borderRadius: 99,
                            border: '1px solid rgba(148,163,184,0.3)',
                            background: 'rgba(148,163,184,0.1)',
                            color: '#cbd5e1',
                          }}
                          title={r.availability}
                        >
                          {r.label}
                          {r.retrievedRecordCount === null ? '' : ` · ${r.retrievedRecordCount} records`}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>
                      NOT DISCOVERED
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}

      {/* Last refresh indicator */}
      {lastRefresh ? (
        <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: synced ? '#10b981' : '#f59e0b', display: 'inline-block' }} />
          {synced ? 'Live' : 'No sync'} · Updated {lastRefresh.toLocaleTimeString()}
          {prev?.at ? ` · Previous: ${new Date(prev.at).toLocaleTimeString()}` : ''}
        </div>
      ) : null}

      {/* AI Daily Brief */}
      {briefText ? (
        <section className={styles.aiCard} style={{ marginBottom: '1rem' }}>
          <span className={styles.aiBadge}>Ellinea AI · Daily Brief</span>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem', whiteSpace: 'pre-line', lineHeight: 1.65 }}>{briefText}</p>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <Link href="/app/ellinea" className={styles.ghostBtn}>Full Ask workspace</Link>
            <button type="button" className={styles.ghostBtn} onClick={() => setBriefText('')}>Dismiss</button>
          </div>
        </section>
      ) : null}

      {/* KPI strip with trend indicators */}
      <div className={styles.kpis}>
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className={styles.kpi} style={{ textDecoration: 'none', color: 'inherit' }}>
            <span>{kpi.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <strong>{loading ? '—' : kpi.value !== null ? String(kpi.value) + kpi.unit : '—'}</strong>
              {!loading && kpi.value !== null && prev ? trendArrow(kpi.trend, kpi.positive) : null}
            </div>
            <em style={{ fontSize: '0.7rem', color: 'var(--c-muted)' }}>
              {loading ? 'Loading…' : kpi.value !== null
                ? prev?.[kpi.label.toLowerCase() as keyof PrevSnapshot] !== undefined
                  ? `was ${prev[kpi.label.toLowerCase() as keyof PrevSnapshot]}`
                  : 'tap to open'
                : 'Awaiting sync'}
            </em>
          </Link>
        ))}
      </div>

      {/* UEM counts if available */}
      {synced && summary?.model?.counts ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.5rem 0 0.75rem' }}>
          {([
            ['Branches', summary.model.counts.branches, '/app/org-system'],
            ['People', summary.model.counts.people, '/app/people'],
            ['Assets', summary.model.counts.assets, '/app/fleet'],
            ['Tasks', summary.model.counts.tasks, '/app/org-system/tasks'],
            ['Documents', summary.model.counts.documents, '/app/documents'],
          ] as [string, number, string][]).map(([label, count, href]) => (
            <Link
              key={label}
              href={href}
              style={{
                padding: '0.2rem 0.6rem',
                borderRadius: 99,
                fontSize: '0.75rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#c5cddb',
                textDecoration: 'none',
                display: 'inline-flex',
                gap: '0.3rem',
              }}
            >
              <span style={{ color: 'var(--c-muted)' }}>{label}</span>
              <strong>{count}</strong>
            </Link>
          ))}
        </div>
      ) : null}

      {/* Not synced callout */}
      {!loading && !synced ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>Awaiting connector sync</strong>
            <p>Sync a connector to unlock live KPIs, trend indicators, and the Ellinea daily brief.</p>
          </div>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.ghostBtn}>Open Connectors</Link>
          ) : null}
        </div>
      ) : null}

      {/* Report preview + schedules */}
      <section className={styles.card} style={{ marginTop: '1rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Report preview</div>
            <h2 className={styles.cardTitle}>Executive pack</h2>
          </div>
          {orgAdmin ? (
            <Link href="/app/reports" className={styles.primaryLink}>Schedules →</Link>
          ) : null}
        </div>
        <pre style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.5, color: '#94a3b8' }}>
          {preview || 'Loading preview…'}
        </pre>
        {enabledSchedules.length > 0 ? (
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {enabledSchedules.map((item) => (
              <li key={item.id}>
                <span className={styles.dot} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.cadence}{item.nextRunHint ? ` · ${item.nextRunHint}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.lede} style={{ marginTop: '0.75rem' }}>
            {orgAdmin
              ? 'No enabled schedules — create one under Scheduled Reports to get email delivery.'
              : 'Schedules are managed by Owner/IT.'}
          </p>
        )}
      </section>

      {/* Ellinea recommendations */}
      {prefs.ellineaShowRecommendations !== false && recs.length > 0 ? (
        <section className={styles.card} style={{ marginTop: '1rem' }}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.panelLabel}>Ellinea on mobile</div>
              <h2 className={styles.cardTitle}>Suggestions for {role}</h2>
            </div>
            <Link href="/app/ellinea" className={styles.primaryLink}>Ask →</Link>
          </div>
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {recs.map((rec) => (
              <li key={rec.id}>
                <span className={styles.dot} style={{ background: '#a78bfa' }} />
                <div>
                  <strong>{rec.title}</strong>
                  <p>
                    {rec.rationale}
                    {typeof rec.confidence === 'number'
                      ? ` · ${Math.round(rec.confidence * 100)}% confidence`
                      : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
