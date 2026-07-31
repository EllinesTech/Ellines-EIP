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

const DEFAULT_REST_ENDPOINT = '/api/v1/connectors/rest-sample';

export default function ConnectorsPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [items, setItems] = useState<ConnectorStatusDto[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [restEndpoint, setRestEndpoint] = useState(DEFAULT_REST_ENDPOINT);

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
    const saved = localStorage.getItem('eip_rest_endpoint');
    if (saved) setRestEndpoint(saved);
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
      const options =
        id === 'rest-api'
          ? { endpoint: restEndpoint.trim() || DEFAULT_REST_ENDPOINT }
          : undefined;
      if (id === 'rest-api' && options?.endpoint) {
        localStorage.setItem('eip_rest_endpoint', options.endpoint);
      }
      const summary = await syncConnector(id, options);
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
            Connect Systems of Record without custom code. Demo JSON for a quick seed; REST API for any
            JSON endpoint your business already exposes.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={styles.brief} style={{ marginBottom: '1.1rem' }}>
        <div className={styles.panelLabel}>REST API endpoint</div>
        <p style={{ marginBottom: '0.75rem' }}>
          Paste a JSON URL from ERP, CRM, HIS, or your own API. Ellinea and the Command Center read the
          normalized snapshot after Sync — no developer required per system.
        </p>
        <label className={adminStyles.form} style={{ display: 'block' }}>
          <span style={{ display: 'block', marginBottom: '0.35rem', color: '#8b95a8', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Endpoint URL
          </span>
          <input
            value={restEndpoint}
            onChange={(e) => setRestEndpoint(e.target.value)}
            placeholder={DEFAULT_REST_ENDPOINT}
            style={{ width: '100%', maxWidth: 640 }}
            aria-label="REST connector endpoint"
          />
        </label>
        <p className={styles.lede} style={{ marginTop: '0.65rem', marginBottom: 0 }}>
          Default sample: <code>{DEFAULT_REST_ENDPOINT}</code> — replace with your system&apos;s HTTPS JSON URL when ready.
        </p>
      </section>

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
                <td>
                  <div>{c.name}</div>
                  {c.message ? (
                    <div style={{ fontSize: '0.78rem', color: '#8b95a8', marginTop: 2 }}>{c.message}</div>
                  ) : null}
                </td>
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
