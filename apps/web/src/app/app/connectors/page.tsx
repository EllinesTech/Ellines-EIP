'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  getSession,
  listConnectors,
  syncConnector,
  type ConnectorStatusDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

export default function ConnectorsPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [items, setItems] = useState<ConnectorStatusDto[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!isOrgAdminRole(s.user.role)) {
      router.replace('/app');
      return;
    }
    setOk(true);
  }, [router]);

  async function load() {
    setError('');
    try {
      setItems(await listConnectors());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connectors');
    }
  }

  useEffect(() => {
    if (!ok) return;
    void load();
  }, [ok]);

  async function onSync(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const summary = await syncConnector(id);
      setNotice(
        `Synced ${summary.connectorName}: health ${summary.healthScore}, ${summary.connectedSystems} systems.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  if (!ok) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking access…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Integration Hub · IT Admin</p>
          <h1>Connectors</h1>
          <p className={styles.lede}>
            Sync Systems of Record into Ellines EIP. Start with the Demo JSON connector for live KPIs.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Available connectors</div>
        <table className={adminStyles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Last sync</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.type}</td>
                <td>{c.status}</td>
                <td>{c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : '—'}</td>
                <td>
                  <button
                    type="button"
                    className={adminStyles.primary}
                    disabled={busy}
                    onClick={() => void onSync(c.id)}
                  >
                    {busy ? 'Syncing…' : 'Sync now'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
