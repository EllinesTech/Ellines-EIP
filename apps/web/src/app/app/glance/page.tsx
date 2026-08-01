'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  buildEllineaRecommendations,
  type EllineaRecommendation,
} from '@/lib/ellinea-engine';
import {
  fetchEnterpriseSummary,
  getSession,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import {
  buildReportPreview,
  readScheduledReports,
  type ScheduledReport,
} from '@/lib/scheduled-reports';
import { DEFAULT_UI_PREFS, readUiPrefs, type UiPrefs } from '@/lib/ui-prefs';
import styles from '../command.module.css';

export default function GlanceCompanionPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [preview, setPreview] = useState('');
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [recs, setRecs] = useState<EllineaRecommendation[]>([]);
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState('member');

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setOrgAdmin(isOrgAdminRole(s.user.role));
    setRole(s.user.role);
    setPrefs(readUiPrefs());
    setSchedules(readScheduledReports(s.organization.id));

    fetchEnterpriseSummary()
      .then((snap) => {
        setSummary(snap);
        const synced = snap.status === 'synced';
        setPreview(
          buildReportPreview({
            orgName: s.organization.name,
            healthScore: synced ? snap.healthScore : 0,
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
            }).slice(0, 3),
          );
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load glance'));
  }, []);

  const synced = summary?.status === 'synced';
  const enabledSchedules = schedules.filter((r) => r.enabled);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mobile Work Companion</p>
          <h1>Live glance</h1>
          <p className={styles.lede}>
            Sync-backed KPIs and report previews sized for the phone shell — same enterprise
            snapshot as Overview, without a second System of Record.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app" className={styles.ghostBtn}>
            Overview
          </Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>Health</span>
          <strong>{synced ? summary!.healthScore : '—'}</strong>
          <em>{synced ? summary!.connectorName : 'Awaiting sync'}</em>
        </div>
        <div className={styles.kpi}>
          <span>Alerts</span>
          <strong className={(summary?.openAlerts || 0) > 0 ? styles.warn : undefined}>
            {synced ? summary!.openAlerts : '—'}
          </strong>
          <em>Open pressure</em>
        </div>
        <div className={styles.kpi}>
          <span>Decisions</span>
          <strong>{synced ? summary!.openDecisions : '—'}</strong>
          <em>Needs attention</em>
        </div>
        <div className={styles.kpi}>
          <span>Systems</span>
          <strong>{synced ? summary!.connectedSystems : '—'}</strong>
          <em>Connected</em>
        </div>
      </div>

      <section className={styles.card} style={{ marginTop: '1rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Report preview</div>
            <h2 className={styles.cardTitle}>Executive pack (local)</h2>
          </div>
          {orgAdmin ? (
            <Link href="/app/reports" className={styles.primaryLink}>
              Schedules →
            </Link>
          ) : null}
        </div>
        <pre
          style={{
            marginTop: '0.75rem',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: '0.88rem',
            lineHeight: 1.45,
            color: 'var(--dash-muted, #94a3b8)',
          }}
        >
          {preview || 'Loading preview…'}
        </pre>
        {enabledSchedules.length ? (
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {enabledSchedules.slice(0, 5).map((item) => (
              <li key={item.id}>
                <span className={styles.dot} />
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.cadence}
                    {item.nextRunHint ? ` · ${item.nextRunHint}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.lede} style={{ marginTop: '0.75rem' }}>
            {orgAdmin
              ? 'No enabled schedules yet — create one under Scheduled Reports.'
              : 'Schedules are managed by Owner/IT. Preview above uses the live snapshot.'}
          </p>
        )}
      </section>

      {prefs.ellineaShowRecommendations !== false && recs.length ? (
        <section className={styles.card} style={{ marginTop: '1rem' }}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.panelLabel}>Ellinea on mobile</div>
              <h2 className={styles.cardTitle}>Suggestions for {role}</h2>
            </div>
            <Link href="/app/ellinea" className={styles.primaryLink}>
              Open Ask →
            </Link>
          </div>
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {recs.map((rec) => (
              <li key={rec.id}>
                <span className={styles.dot} />
                <div>
                  <strong>{rec.title}</strong>
                  <p>
                    {rec.rationale}
                    {typeof rec.confidence === 'number'
                      ? ` · confidence ${Math.round(rec.confidence * 100)}%`
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
