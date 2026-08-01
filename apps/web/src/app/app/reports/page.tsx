'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import {
  buildReportPreview,
  readScheduledReports,
  writeScheduledReports,
  type ReportCadence,
  type ScheduledReport,
} from '@/lib/scheduled-reports';
import {
  fetchEnterpriseSummary,
  getSession,
  listReportsApi,
  createReportApi,
  runReportApi,
  toggleReportApi,
  deleteReportApi,
  type ScheduledReportDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

function fromDto(dto: ScheduledReportDto): ScheduledReport {
  return {
    id: dto.id,
    title: dto.title,
    cadence: dto.cadence as ReportCadence,
    enabled: dto.enabled,
    lastRunAt: dto.lastRunAt,
    nextRunHint: dto.nextRunHint,
    createdAt: dto.createdAt,
  };
}

export default function ReportsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [items, setItems] = useState<ScheduledReport[]>([]);
  const [title, setTitle] = useState('CEO Daily Brief pack');
  const [cadence, setCadence] = useState<ReportCadence>('daily');
  const [preview, setPreview] = useState('');
  const [serverSync, setServerSync] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    if (!isOrgAdminRole(s.user.role)) { router.replace('/app'); return; }
    setAllowed(true);
    setOrgId(s.organization.id);
    setOrgName(s.organization.name);

    // Load reports — server first, localStorage fallback
    listReportsApi()
      .then((dtos) => {
        const serverItems = dtos.map(fromDto);
        setItems(serverItems);
        setServerSync(true);
        writeScheduledReports(s.organization.id, serverItems);
      })
      .catch(() => {
        setItems(readScheduledReports(s.organization.id));
      });

    // Build preview from live snapshot
    fetchEnterpriseSummary()
      .then((summary) => {
        setPreview(buildReportPreview({
          orgName: s.organization.name,
          healthScore: summary.status === 'synced' ? summary.healthScore : 0,
          openAlerts: summary.openAlerts || 0,
          openDecisions: summary.openDecisions || 0,
          connectedSystems: summary.connectedSystems || 0,
          briefHighlight: summary.status === 'synced'
            ? summary.briefHighlight
            : 'No live snapshot yet — sync connectors first.',
        }));
      })
      .catch(() => {
        setPreview(buildReportPreview({
          orgName: s.organization.name,
          healthScore: 0, openAlerts: 0, openDecisions: 0, connectedSystems: 0,
          briefHighlight: 'Snapshot unavailable.',
        }));
      });
  }, [router]);

  function localPersist(next: ScheduledReport[]) {
    if (!orgId) return;
    setItems(next);
    if (!serverSync) writeScheduledReports(orgId, next);
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);

    if (serverSync) {
      createReportApi({ title: title.trim(), cadence })
        .then((dto) => {
          setItems((prev) => [fromDto(dto), ...prev]);
          setTitle('CEO Daily Brief pack');
        })
        .catch(() => {
          const next: ScheduledReport = {
            id: `rpt_${Date.now()}`, title: title.trim(), cadence, enabled: true,
            lastRunAt: null,
            nextRunHint: cadence === 'daily' ? 'Tomorrow morning (local)' : 'Next Monday (local)',
            createdAt: new Date().toISOString(),
          };
          localPersist([next, ...items]);
          setTitle('CEO Daily Brief pack');
        })
        .finally(() => setBusy(false));
      return;
    }

    const next: ScheduledReport = {
      id: `rpt_${Date.now()}`, title: title.trim(), cadence, enabled: true,
      lastRunAt: null,
      nextRunHint: cadence === 'daily' ? 'Tomorrow morning (local stub)' : 'Next Monday (local stub)',
      createdAt: new Date().toISOString(),
    };
    localPersist([next, ...items]);
    setTitle('CEO Daily Brief pack');
    setBusy(false);
  }

  function runNow(id: string) {
    if (busy) return;
    setBusy(true);

    if (serverSync) {
      runReportApi(id)
        .then((dto) => setItems((prev) => prev.map((r) => r.id === id ? fromDto(dto) : r)))
        .catch(() => {
          const now = new Date().toISOString();
          localPersist(items.map((r) =>
            r.id === id ? { ...r, lastRunAt: now, nextRunHint: r.cadence === 'daily' ? 'Tomorrow morning' : 'Next Monday' } : r,
          ));
        })
        .finally(() => setBusy(false));
      return;
    }

    const now = new Date().toISOString();
    localPersist(items.map((r) =>
      r.id === id ? { ...r, lastRunAt: now, nextRunHint: r.cadence === 'daily' ? 'Tomorrow morning (local stub)' : 'Next Monday (local stub)' } : r,
    ));
    setBusy(false);
  }

  function toggle(id: string) {
    const report = items.find((r) => r.id === id);
    if (!report || busy) return;
    const nextEnabled = !report.enabled;

    if (serverSync) {
      setBusy(true);
      toggleReportApi(id, nextEnabled)
        .then((dto) => setItems((prev) => prev.map((r) => r.id === id ? fromDto(dto) : r)))
        .catch(() => localPersist(items.map((r) => r.id === id ? { ...r, enabled: nextEnabled } : r)))
        .finally(() => setBusy(false));
      return;
    }
    localPersist(items.map((r) => r.id === id ? { ...r, enabled: nextEnabled } : r));
  }

  function remove(id: string) {
    if (busy) return;
    if (serverSync) {
      setBusy(true);
      deleteReportApi(id)
        .then(() => setItems((prev) => prev.filter((r) => r.id !== id)))
        .catch(() => localPersist(items.filter((r) => r.id !== id)))
        .finally(() => setBusy(false));
      return;
    }
    localPersist(items.filter((r) => r.id !== id));
  }

  if (!allowed) return <div className={styles.page}><p className={styles.lede}>Checking access…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workflow</p>
          <h1>Scheduled reports</h1>
          <p className={styles.lede}>
            Daily/weekly packs for {orgName}.
            {serverSync ? ' Server-persisted.' : ' Local until Supabase is connected.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/rules" className={styles.ghostBtn}>Rules</Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
        </div>
      </header>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Schedule</div>
        <form className={adminStyles.form} onSubmit={onAdd}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
          </label>
          <label>
            Cadence
            <select value={cadence} onChange={(e) => setCadence(e.target.value as ReportCadence)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            Add schedule
          </button>
        </form>
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Schedules · {items.length}</div>
        {!items.length ? (
          <p className={styles.lede}>No schedules yet.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Title</th><th>Cadence</th><th>Next</th><th>Last run</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td>{r.cadence}</td>
                  <td>{r.enabled ? r.nextRunHint : 'Paused'}</td>
                  <td>{r.lastRunAt ? new Date(r.lastRunAt).toLocaleString() : '—'}</td>
                  <td>
                    <button
                      type="button" className={adminStyles.primary}
                      onClick={() => runNow(r.id)} disabled={!r.enabled || busy}
                    >Run now</button>{' '}
                    <button type="button" className={adminStyles.ghost} disabled={busy} onClick={() => toggle(r.id)}>
                      {r.enabled ? 'Pause' : 'Resume'}
                    </button>{' '}
                    <button type="button" className={adminStyles.ghost} disabled={busy} onClick={() => remove(r.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Preview</div>
        <pre className={adminStyles.actionCode} style={{ whiteSpace: 'pre-wrap', marginTop: '0.45rem' }}>
          {preview || 'Loading…'}
        </pre>
      </section>
    </div>
  );
}
