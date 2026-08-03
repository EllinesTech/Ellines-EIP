'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import {
  getSession,
  listDashboardsApi,
  createDashboardApi,
  deleteDashboardApi,
  type DashboardDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

export default function DashboardsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [items, setItems] = useState<DashboardDto[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    if (!isOrgAdminRole(s.user.role)) { router.replace('/app'); return; }
    setAllowed(true);
    setOrgId(s.organization.id);
    setOrgName(s.organization.name);
    load();
  }, [router]);

  function load() {
    const s = getSession();
    if (!s || !s.organization.id) return;
    listDashboardsApi(s.organization.id)
      .then((data) => setItems(data))
      .catch(() => setItems([]));
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !orgId || busy) return;
    setBusy(true);
    setNotice('');
    createDashboardApi({
      organizationId: orgId,
      name: name.trim(),
      description: description.trim(),
      createdBy: (getSession()?.user.id || 'system'),
    })
      .then((dto) => {
        setItems((prev) => [dto, ...prev]);
        setName('');
        setDescription('');
        setNotice('Dashboard created.');
      })
      .catch((err) => setNotice(err.message || 'Failed to create dashboard.'))
      .finally(() => setBusy(false));
  }

  function onDelete(id: string) {
    if (!orgId || busy) return;
    if (!confirm('Delete this dashboard and all its widgets?')) return;
    setBusy(true);
    setNotice('');
    deleteDashboardApi(id, orgId)
      .then(() => {
        setItems((prev) => prev.filter((d) => d.id !== id));
        setNotice('Dashboard deleted.');
      })
      .catch((err) => setNotice(err.message || 'Failed to delete dashboard.'))
      .finally(() => setBusy(false));
  }

  if (!allowed) return <div className={styles.page}><p className={styles.lede}>Checking access…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Business Intelligence</p>
          <h1>Dashboards</h1>
          <p className={styles.lede}>
            Custom KPI dashboards for {orgName}.
            {items.length === 0 ? ' Create your first dashboard below.' : ` ${items.length} dashboard${items.length === 1 ? '' : 's'} total.`}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app" className={styles.ghostBtn}>Command Center</Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
        </div>
      </header>

      {notice ? (
        <p className={adminStyles.error} style={{ marginBottom: '0.65rem' }}>{notice}</p>
      ) : null}

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Create dashboard</div>
        <form className={adminStyles.form} onSubmit={onCreate}>
          <label style={{ gridColumn: '1 / -1' }}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Executive Overview" />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="KPIs, trends, and alerts for leadership" />
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            {busy ? 'Creating…' : 'Create dashboard'}
          </button>
        </form>
      </section>

      <section className={adminStyles.tableWrap} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Dashboards · {items.length}</div>
        {!items.length ? (
          <p className={styles.lede}>No dashboards yet.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Widgets</th>
                <th>Refresh</th>
                <th>Public</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/app/dashboards/${d.id}`} style={{ color: '#c5cddb', textDecoration: 'none', fontWeight: 600 }}>
                      {d.name}
                    </Link>
                  </td>
                  <td>{d.description || '—'}</td>
                  <td>{d.widgets?.length ?? 0}</td>
                  <td>{d.refreshRate}s</td>
                  <td>{d.isPublic ? 'Yes' : 'No'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Link href={`/app/dashboards/${d.id}`} className={adminStyles.primary} style={{ textDecoration: 'none', padding: '0.35rem 0.7rem' }}>
                        Open
                      </Link>
                      <button type="button" className={adminStyles.ghost} disabled={busy} onClick={() => onDelete(d.id)}>
                        Delete
                      </button>
                    </div>
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
