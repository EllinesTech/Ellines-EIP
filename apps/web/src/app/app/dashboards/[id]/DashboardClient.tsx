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
import DashboardBuilder from './DashboardBuilder';
import styles from '../../command.module.css';
import adminStyles from '../../admin/admin.module.css';

const CONDITIONS = ['gt', 'lt', 'eq', 'gte', 'lte'] as const;

export default function DashboardClient() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const [allowed, setAllowed] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [exportsList, setExportsList] = useState<DashboardExportDto[]>([]);
  const [alertForm, setAlertForm] = useState({ condition: 'gt' as typeof CONDITIONS[number], threshold: 0, active: true });
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    if (!isOrgAdminRole(s.user.role)) { router.replace('/app'); return; }
    setAllowed(true);
    setOrgId(s.organization.id);
    load(id);
  }, [router, id]);

  // Auto-refresh: poll based on dashboard.refreshRate (seconds, 0 = disabled)
  useEffect(() => {
    if (!dashboard || !orgId) return;
    const rate = dashboard.refreshRate;
    if (!rate || rate < 30) return; // min 30s, 0 = off
    const intervalMs = rate * 1000;
    const timer = setInterval(() => {
      setRefreshing(true);
      getDashboardApi(dashboard.id, orgId)
        .then((dto) => {
          setDashboard(dto);
          setLastRefreshed(new Date());
        })
        .catch(() => { /* silent — don't flash on background poll */ })
        .finally(() => setRefreshing(false));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [dashboard?.id, dashboard?.refreshRate, orgId]);

  function load(dashboardId: string) {
    const s = getSession();
    if (!s || !s.organization.id) return;
    getDashboardApi(dashboardId, s.organization.id)
      .then((dto) => { setDashboard(dto); setLastRefreshed(new Date()); })
      .catch(() => router.replace('/app/dashboards'));
    listExportsApi(dashboardId, s.organization.id)
      .then((data) => setExportsList(data))
      .catch(() => setExportsList([]));
  }

  function manualRefresh() {
    if (!dashboard || !orgId || refreshing) return;
    setRefreshing(true);
    getDashboardApi(dashboard.id, orgId)
      .then((dto) => { setDashboard(dto); setLastRefreshed(new Date()); })
      .catch((err) => flash(err.message || 'Refresh failed.'))
      .finally(() => setRefreshing(false));
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
    const refreshRate = Number(fd.get('refreshRate') || 0);
    const isPublic = fd.get('isPublic') === 'on';
    if (!name) return;
    setBusy(true);
    updateDashboardApi(dashboard.id, { organizationId: orgId, name, description, refreshRate, isPublic })
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

    // CSV: generate client-side and download immediately
    if (format === 'csv') {
      const widgets = dashboard.widgets || [];
      const rows: string[] = ['Widget,Type,Title'];
      widgets.forEach((w) => {
        const configStr = JSON.stringify(w.config || {}).replace(/"/g, '""');
        rows.push(`"${w.id}","${w.type}","${(w.title || '').replace(/"/g, '""')}"`);
        // Add config data rows if present
        const cfg = w.config as Record<string, unknown>;
        if (cfg?.data && Array.isArray(cfg.data)) {
          rows.push(`,,`);
          rows.push(`,,--- ${w.title} data ---`);
          const data = cfg.data as Record<string, unknown>[];
          if (data.length > 0) {
            rows.push(`,,"${Object.keys(data[0]).join('","')}"`);
            data.forEach((row) => {
              rows.push(`,,${Object.values(row).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')}`);
            });
          }
        }
      });
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dashboard.name.replace(/[^a-z0-9]/gi, '_')}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      flash('CSV downloaded.');
      return;
    }

    // PDF / Excel: queue server-side record (placeholder for future full rendering)
    setBusy(true);
    exportDashboardApi(dashboard.id, { organizationId: orgId, format })
      .then(() => {
        flash(`Export (${format}) scheduled. Check back for download links once implemented.`);
        load(dashboard.id);
      })
      .catch((err) => flash(err.message || 'Failed to schedule export.'))
      .finally(() => setBusy(false));
  }

  function copyShareLink() {
    if (!dashboard) return;
    const url = `${window.location.origin}/app/dashboards/${dashboard.id}`;
    navigator.clipboard.writeText(url)
      .then(() => flash(dashboard.isPublic ? '🔗 Share link copied!' : '⚠ Link copied — mark dashboard as Public so others can view it.'))
      .catch(() => flash('Could not copy link — please copy it manually from the address bar.'));
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
          {/* Refresh indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
            {dashboard.refreshRate > 0 && (
              <span title={`Auto-refresh every ${dashboard.refreshRate}s`}>
                ⟳ {dashboard.refreshRate}s
              </span>
            )}
            {lastRefreshed && (
              <span title={`Last refreshed at ${lastRefreshed.toLocaleTimeString()}`}>
                · {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            {refreshing && <span style={{ color: '#6F2D8D' }}>↻</span>}
          </div>
          <button
            type="button"
            className={adminStyles.ghost}
            onClick={manualRefresh}
            disabled={refreshing || busy}
            title="Refresh dashboard data now"
          >
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
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
        <DashboardBuilder
          dashboard={dashboard}
          onWidgetAdd={async (type, title, size) => {
            const s = getSession();
            if (!s || !orgId) throw new Error('No session');
            const widget = await addWidgetApi(dashboard.id, {
              organizationId: orgId,
              type,
              title,
              config: {},
              position: (dashboard.widgets || []).length,
              size: size ?? { w: 2, h: 2 },
            });
            setDashboard((prev) =>
              prev ? { ...prev, widgets: [...(prev.widgets || []), widget] } : prev
            );
            return widget;
          }}
          onWidgetUpdate={(widget, patch) => onUpdateWidget(widget, patch)}
          onWidgetDelete={(widgetId) => onDeleteWidget(widgetId)}
          busy={busy}
        />
      </section>

      <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Export & Share</div>

        {/* Share link */}
        <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#1e293b', borderRadius: '6px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: '0.2rem' }}>
                🔗 Share link
                {dashboard.isPublic
                  ? <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#10b981', background: '#0f2a1e', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Public</span>
                  : <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#f59e0b', background: '#2a1f0a', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Private</span>
                }
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {dashboard.isPublic
                  ? 'Anyone with the link can view this dashboard.'
                  : 'Mark as Public in Settings to allow link sharing.'}
              </div>
            </div>
            <button
              type="button"
              className={adminStyles.ghost}
              onClick={copyShareLink}
              style={{ whiteSpace: 'nowrap' }}
            >
              📋 Copy link
            </button>
          </div>
        </div>

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            type="button"
            className={adminStyles.primary}
            disabled={busy}
            onClick={() => onExport('csv')}
            title="Download widget data as CSV"
          >
            ⬇ CSV
          </button>
          <button
            type="button"
            className={adminStyles.ghost}
            disabled={busy}
            onClick={() => onExport('pdf')}
            title="Schedule PDF export (coming soon)"
          >
            PDF (scheduled)
          </button>
          <button
            type="button"
            className={adminStyles.ghost}
            disabled={busy}
            onClick={() => onExport('excel')}
            title="Schedule Excel export (coming soon)"
          >
            Excel (scheduled)
          </button>
        </div>

        {/* Export schedule records */}
        {exportsList.length > 0 && (
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
        )}
      </section>
    </div>
  );
}
