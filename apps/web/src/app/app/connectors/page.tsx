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

const DEFAULT_CSV = `metric,value
healthScore,81
connectedSystems,4
openAlerts,1
openDecisions,3
briefHighlight,"Branch ops CSV export — no vendor API; file landed from nightly ERP dump."
`;

const CATALOG = [
  {
    id: 'csv-file',
    title: 'CSV / File export',
    tag: 'No API needed',
    blurb: 'Import nightly CSV/Excel dumps the business already produces.',
    state: 'live',
  },
  {
    id: 'rest-api',
    title: 'REST / HTTP API',
    tag: 'When API exists',
    blurb: 'Pull JSON from any HTTPS endpoint IT can reach.',
    state: 'live',
  },
  {
    id: 'demo-json',
    title: 'Demo JSON seed',
    tag: 'Demo',
    blurb: 'Built-in sample for smoke tests and demos.',
    state: 'live',
  },
  {
    id: 'postgres',
    title: 'PostgreSQL (read-only)',
    tag: 'Coming next',
    blurb: 'Connect to the system database when vendors will not ship an API.',
    state: 'soon',
  },
  {
    id: 'email-imap',
    title: 'Email (IMAP)',
    tag: 'Planned',
    blurb: 'Ingest mailed reports and alerts from legacy systems.',
    state: 'soon',
  },
  {
    id: 'sftp',
    title: 'SFTP / folder drop',
    tag: 'Planned',
    blurb: 'Watch SFTP/inbox folders — common in healthcare and supply chain.',
    state: 'soon',
  },
  {
    id: 'sqlserver',
    title: 'SQL Server / MySQL',
    tag: 'Planned',
    blurb: 'Read-only DB sync for on-prem ERP and HIS backends.',
    state: 'soon',
  },
  {
    id: 'webhook',
    title: 'Webhooks / events',
    tag: 'Planned',
    blurb: 'Receive pushes when a system can call EIP.',
    state: 'soon',
  },
] as const;

export default function ConnectorsPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [items, setItems] = useState<ConnectorStatusDto[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [restEndpoint, setRestEndpoint] = useState(DEFAULT_REST_ENDPOINT);
  const [csvText, setCsvText] = useState(DEFAULT_CSV);

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
    const savedUrl = localStorage.getItem('eip_rest_endpoint');
    if (savedUrl) setRestEndpoint(savedUrl);
    const savedCsv = localStorage.getItem('eip_csv_text');
    if (savedCsv) setCsvText(savedCsv);
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
      let options: { endpoint?: string; csvText?: string } | undefined;
      if (id === 'rest-api') {
        options = { endpoint: restEndpoint.trim() || DEFAULT_REST_ENDPOINT };
        localStorage.setItem('eip_rest_endpoint', options.endpoint!);
      }
      if (id === 'csv-file') {
        options = { csvText: csvText.trim() || DEFAULT_CSV };
        localStorage.setItem('eip_csv_text', options.csvText!);
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
            Ellines does not need a vendor developer to hand you an API. Connect how the business already
            moves data — files, databases, email, or APIs when they exist. Ellinea only reads the normalized
            snapshot.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={styles.brief} style={{ marginBottom: '1.1rem' }}>
        <div className={styles.panelLabel}>How EIP connects (many paths)</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
            marginTop: '0.75rem',
          }}
        >
          {CATALOG.map((c) => (
            <article
              key={c.id}
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '0.85rem 0.9rem',
                background: c.state === 'live' ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a78bfa' }}>
                {c.tag}
              </div>
              <strong style={{ display: 'block', marginTop: 6, color: '#fff' }}>{c.title}</strong>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#8b95a8', lineHeight: 1.4 }}>
                {c.blurb}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.brief} style={{ marginBottom: '1.1rem' }}>
        <div className={styles.panelLabel}>CSV / File (no API)</div>
        <p style={{ marginBottom: '0.75rem' }}>
          If the system only exports files, paste the CSV here and Sync. This is the standard path when
          developers will not provide an API.
        </p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={7}
          aria-label="CSV content"
          style={{
            width: '100%',
            maxWidth: 720,
            font: 'inherit',
            fontSize: '0.85rem',
            padding: '0.75rem 0.85rem',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            background: '#0b0e14',
            color: '#f4f7fb',
            resize: 'vertical',
          }}
        />
      </section>

      <section className={styles.brief} style={{ marginBottom: '1.1rem' }}>
        <div className={styles.panelLabel}>REST API endpoint (optional)</div>
        <p style={{ marginBottom: '0.75rem' }}>
          Use only when the system exposes JSON over HTTPS. Otherwise use CSV / File or wait for Database /
          Email connectors.
        </p>
        <input
          value={restEndpoint}
          onChange={(e) => setRestEndpoint(e.target.value)}
          placeholder={DEFAULT_REST_ENDPOINT}
          style={{ width: '100%', maxWidth: 640 }}
          aria-label="REST connector endpoint"
        />
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Ready to sync now</div>
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
