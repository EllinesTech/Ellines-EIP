'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import {
  getSession,
  getDashboardApi,
  updateDashboardApi,
  deleteDashboardApi,
  addWidgetApi,
  updateWidgetApi,
  deleteWidgetApi,
  addAlertApi,
  updateAlertApi,
  deleteAlertApi,
  exportDashboardApi,
  listExportsApi,
  deleteExportApi,
  type DashboardDto,
  type WidgetDto,
  type AlertDto,
  type DashboardExportDto,
} from '@/lib/api';
import styles from '../../command.module.css';
import adminStyles from '../../admin/admin.module.css';

const WIDGET_TYPES = ['kpi', 'gauge', 'line', 'bar', 'table'] as const;
const CONDITIONS = ['gt', 'lt', 'eq', 'gte', 'lte'] as const;

export default function DashboardClient() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const [allowed, setAllowed] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showAddAlert, setShowAddAlert] = useState<string | null>(null);
  const [exportsList, setExportsList] = useState<DashboardExportDto[]>([]);

  const [widgetForm, setWidgetForm] = useState({ type: 'kpi', title: '', config: '{}', position: 0, size: '{"w":2,"h":2}' });
  const [alertForm, setAlertForm] = useState({ condition: 'gt' as typeof CONDITIONS[number], threshold: 0, active: true });

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    if (!isOrgAdminRole(s.user.role)) { router.replace('/app'); return; }
    setAllowed(true);
    setOrgId(s.organization.id);
    load(id);
  }, [router, id]);

  function load(dashboardId: string) {
    const s = getSession();
    if (!s || !s.organization.id) return;
    getDashboardApi(dashboardId, s.organization.id)
      .then((dto) => setDashboard(dto))
      .catch(() => router.replace('/app/dashboards'));
    listExportsApi(dashboardId, s.organization.id)
      .then((data) => setExportsList(data))
      .catch(() => setExportsList([]));
  }

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  }

  function onRename(e: FormEvent) {
    e.preventDefault();
    if (!dashboard || !orgId || busy) return;
    const fd = new FormData(e.target as HTMLFormElement);
    const name = String(fd.get('name') || '').trim();
    const description = String(fd.get('description') || '').trim();
    if (!name) return;
    setBusy(true);
    updateDashboardApi(dashboard.id, { organizationId: orgId, name, description })
      .then((dto) => { setDashboard(dto); flash('Saved.'); })
      .catch((err) => flash(err.message || 'Failed to save.'))
      .finally(() => setBusy(false));
  }

  function onDelete() {
    if (!dashboard || !orgId || busy) return;
    if (!confirm('Delete this dashboard?')) return;
    setBusy(true);
    deleteDashboardApi(dashboard.id, orgId)
      .then(() => router.replace('/app/dashboards'))
      .catch((err) => flash(err.message || 'Failed to delete.'))
      .finally(() => setBusy(false));
  }

  function onCreateWidget(e: FormEvent) {
    e.preventDefault();
    if (!dashboard || !orgId || busy) return;
    setBusy(true);
    addWidgetApi(dashboard.id, {
      organizationId: orgId,
      type: widgetForm.type,
      title: widgetForm.title,
      config: JSON.parse(widgetForm.config || '{}'),
      position: widgetForm.position,
      size: JSON.parse(widgetForm.size || '{"w":2,"h":2}'),
    })
      .then((dto) => {
        setDashboard((prev) => prev ? { ...prev, widgets: [...(prev.widgets || []), dto] } : prev);
        setShowAddWidget(false);
        setWidgetForm({ type: 'kpi', title: '', config: '{}', position: 0, size: '{"w":2,"h":2}' });
        flash('Widget added.');
      })
      .catch((err) => flash(err.message || 'Failed to add widget.'))
      .finally(() => setBusy(false));
  }

  function onUpdateWidget(widget: WidgetDto, patch: Partial<WidgetDto>) {
    if (!dashboard || !orgId || busy) return;
    setBusy(true);
    updateWidgetApi(dashboard.id, widget.id, { organizationId: orgId, ...patch })
      .then((dto) => {
        setDashboard((prev) => prev ? {
          ...prev,
          widgets: (prev.widgets || []).map((w) => w.id === dto.id ? dto : w),
        } : prev);
      })
      .catch((err) => flash(err.message || 'Failed to update widget.'))
      .finally(() => setBusy(false));
  }

  function onDeleteWidget(widgetId: string) {
    if (!dashboard || !orgId || busy) return;
    if (!confirm('Remove this widget?')) return;
    setBusy(true);
    deleteWidgetApi(dashboard.id, widgetId, orgId)
      .then(() => {
        setDashboard((prev) => prev ? { ...prev, widgets: (prev.widgets || []).filter((w) => w.id !== widgetId) } : prev);
        flash('Widget removed.');
      })
      .catch((err) => flash(err.message || 'Failed to remove widget.'))
      .finally(() => setBusy(false));
  }

  function onCreateAlert(widgetId: string, e: FormEvent) {
    e.preventDefault();
    if (!dashboard || !orgId || busy) return;
    setBusy(true);
    addAlertApi(dashboard.id, {
      organizationId: orgId,
      widgetId,
      condition: alertForm.condition,
      threshold: alertForm.threshold,
      active: alertForm.active,
    })
      .then((dto) => {
        setDashboard((prev) => prev ? {
          ...prev,
          widgets: (prev.widgets || []).map((w) => w.id === widgetId ? { ...w, alerts: [...(w.alerts || []), dto] } : w),
        } : prev);
        setShowAddAlert(null);
        flash('Alert added.');
      })
      .catch((err) => flash(err.message || 'Failed to add alert.'))
      .finally(() => setBusy(false));
  }

  function onToggleAlert(widgetId: string, alert: AlertDto) {
    if (!dashboard || !orgId || busy) return;
    setBusy(true);
    updateAlertApi(dashboard.id, alert.id, { organizationId: orgId, active: !alert.active })
      .then((dto) => {
        setDashboard((prev) => prev ? {
          ...prev,
          widgets: (prev.widgets || []).map((w) => w.id === widgetId ? { ...w, alerts: (w.alerts || []).map((a) => a.id === dto.id ? dto : a) } : w),
        } : prev);
      })
      .catch((err) => flash(err.message || 'Failed to update alert.'))
      .finally(() => setBusy(false));
  }

  function onDeleteAlert(widgetId: string, alertId: string) {
    if (!dashboard || !orgId || busy) return;
    if (!confirm('Remove this alert?')) return;
    setBusy(true);
    deleteAlertApi(dashboard.id, alertId, orgId)
      .then(() => {
        setDashboard((prev) => prev ? {
          ...prev,
          widgets: (prev.widgets || []).map((w) => w.id === widgetId ? { ...w, alerts: (w.alerts || []).filter((a) => a.id !== alertId) } : w),
        } : prev);
        flash('Alert removed.');
      })
      .catch((err) => flash(err.message || 'Failed to remove alert.'))
      .finally(() => setBusy(false));
  }

  function onExport(format: 'pdf' | 'csv' | 'excel') {
    if (!dashboard || !orgId || busy) return;
    setBusy(true);
    exportDashboardApi(dashboard.id, { organizationId: orgId, format })
      .then(() => {
        flash(`Export (${format}) queued.`);
        load(dashboard.id);
      })
      .catch((err) => flash(err.message || 'Failed to export.'))
      .finally(() => setBusy(false));
  }

  function onDeleteExport(exportId: string) {
    if (!dashboard || !orgId || busy) return;
    setBusy(true);
    deleteExportApi(dashboard.id, exportId, orgId)
      .then(() => {
        setExportsList((prev) => prev.filter((e) => e.id !== exportId));
        flash('Export schedule removed.');
      })
      .catch((err) => flash(err.message || 'Failed to remove export.'))
      .finally(() => setBusy(false));
  }

  if (!allowed || !dashboard) return <div className={styles.page}><p className={styles.lede}>Loading…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Dashboard</p>
          <h1>{dashboard.name}</h1>
          <p className={styles.lede}>{dashboard.description || 'Custom KPI dashboard'}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/dashboards" className={styles.ghostBtn}>All dashboards</Link>
          <button type="button" className={adminStyles.ghost} onClick={onDelete} disabled={busy}>Delete</button>
        </div>
      </header>

      {notice ? <p className={adminStyles.error} style={{ marginBottom: '0.65rem' }}>{notice}</p> : null}

      <section className={styles.brief} style={{ marginBottom: '0.65rem' }}>
        <div className={styles.panelLabel}>Settings</div>
        <form className={adminStyles.form} onSubmit={onRename}>
          <label>
            Name
            <input name="name" defaultValue={dashboard.name} required minLength={2} />
          </label>
          <label>
            Description
            <input name="description" defaultValue={dashboard.description} />
          </label>
          <label>
            Refresh (sec)
            <input name="refreshRate" type="number" min={30} max={3600} defaultValue={dashboard.refreshRate} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', paddingTop: '1.4rem' }}>
            <input type="checkbox" name="isPublic" defaultChecked={dashboard.isPublic} />
            Public
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>Save</button>
        </form>
      </section>

      <section style={{ marginBottom: '0.65rem' }}>
        <div className={styles.panelLabel}>Widgets · {(dashboard.widgets || []).length}</div>
        {!dashboard.widgets?.length ? (
          <p className={styles.lede}>No widgets yet. Add KPI cards, charts, or tables.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.55rem' }}>
            {(dashboard.widgets || []).map((w) => (
              <div key={w.id} style={{
                background: '#161b26',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: '0.65rem 0.75rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b95a8' }}>{w.type}</div>
                    <div style={{ fontWeight: 700, color: '#f4f7fb' }}>{w.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button type="button" className={adminStyles.ghost} style={{ padding: '0.22rem 0.45rem', fontSize: '0.7rem' }} onClick={() => {
                      const next = prompt('New title', w.title);
                      if (next === null) return;
                      onUpdateWidget(w, { title: next });
                    }}>Rename</button>
                    <button type="button" className={adminStyles.ghost} style={{ padding: '0.22rem 0.45rem', fontSize: '0.7rem' }} onClick={() => onDeleteWidget(w.id)}>Remove</button>
                  </div>
                </div>
                <div style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: '#8b95a8' }}>
                  Size: {(w.size as any)?.w ?? 2}×{(w.size as any)?.h ?? 2} · Position: {w.position}
                </div>
                {w.alerts?.length ? (
                  <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {w.alerts.map((a) => (
                      <span key={a.id} style={{
                        fontSize: '0.65rem',
                        padding: '0.18rem 0.45rem',
                        borderRadius: 6,
                        background: a.active ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                        color: a.active ? '#fca5a5' : '#8b95a8',
                        border: `1px solid ${a.active ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}>
                        {a.condition} {a.threshold}
                        <button type="button" onClick={() => onToggleAlert(w.id, a)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.65rem' }}>
                          {a.active ? '⏻' : '◌'}
                        </button>
                        <button type="button" onClick={() => onDeleteAlert(w.id, a.id)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '0.65rem' }}>✕</button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div style={{ marginTop: '0.4rem' }}>
                  <button type="button" className={adminStyles.ghost} style={{ padding: '0.22rem 0.45rem', fontSize: '0.7rem' }} onClick={() => setShowAddAlert(showAddAlert === w.id ? null : w.id)}>
                    + Alert
                  </button>
                </div>
                {showAddAlert === w.id ? (
                  <form className={adminStyles.form} onSubmit={(e) => onCreateAlert(w.id, e)} style={{ marginTop: '0.4rem' }}>
                    <select value={alertForm.condition} onChange={(e) => setAlertForm({ ...alertForm, condition: e.target.value as typeof CONDITIONS[number] })}>
                      {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" step="any" value={alertForm.threshold} onChange={(e) => setAlertForm({ ...alertForm, threshold: Number(e.target.value) })} />
                    <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.35rem', paddingTop: '0.2rem' }}>
                      <input type="checkbox" checked={alertForm.active} onChange={(e) => setAlertForm({ ...alertForm, active: e.target.checked })} />
                      Active
                    </label>
                    <button type="submit" className={adminStyles.primary} disabled={busy} style={{ padding: '0.22rem 0.5rem', fontSize: '0.7rem' }}>Add</button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Add widget</div>
        {!showAddWidget ? (
          <button type="button" className={adminStyles.ghost} onClick={() => setShowAddWidget(true)}>+ New widget</button>
        ) : (
          <form className={adminStyles.form} onSubmit={onCreateWidget}>
            <select value={widgetForm.type} onChange={(e) => setWidgetForm({ ...widgetForm, type: e.target.value })}>
              {WIDGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={widgetForm.title} onChange={(e) => setWidgetForm({ ...widgetForm, title: e.target.value })} placeholder="Widget title" required minLength={2} />
            <input value={widgetForm.config} onChange={(e) => setWidgetForm({ ...widgetForm, config: e.target.value })} placeholder='{"key":"value"}' />
            <input type="number" value={widgetForm.position} onChange={(e) => setWidgetForm({ ...widgetForm, position: Number(e.target.value) })} placeholder="Position" />
            <input value={widgetForm.size} onChange={(e) => setWidgetForm({ ...widgetForm, size: e.target.value })} placeholder='{"w":2,"h":2}' />
            <button type="submit" className={adminStyles.primary} disabled={busy}>Add widget</button>
            <button type="button" className={adminStyles.ghost} onClick={() => setShowAddWidget(false)}>Cancel</button>
          </form>
        )}
      </section>

      <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Exports</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <button type="button" className={adminStyles.primary} disabled={busy} onClick={() => onExport('pdf')}>Export PDF</button>
          <button type="button" className={adminStyles.primary} disabled={busy} onClick={() => onExport('csv')}>Export CSV</button>
          <button type="button" className={adminStyles.primary} disabled={busy} onClick={() => onExport('excel')}>Export Excel</button>
        </div>
        {exportsList.length ? (
          <table className={adminStyles.table}>
            <thead>
              <tr><th>Format</th><th>Schedule</th><th>Last run</th><th>Next run</th><th /></tr>
            </thead>
            <tbody>
              {exportsList.map((ex) => (
                <tr key={ex.id}>
                  <td style={{ textTransform: 'uppercase' }}>{ex.format}</td>
                  <td>{ex.schedule || 'manual'}</td>
                  <td>{ex.lastRun ? new Date(ex.lastRun).toLocaleString() : '—'}</td>
                  <td>{ex.nextRun ? new Date(ex.nextRun).toLocaleString() : '—'}</td>
                  <td>
                    <button type="button" className={adminStyles.ghost} disabled={busy} onClick={() => onDeleteExport(ex.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.lede}>No export schedules yet.</p>
        )}
      </section>
    </div>
  );
}
