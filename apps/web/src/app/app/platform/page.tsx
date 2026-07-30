'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FeatureFlag,
  getSession,
  listPlatformFlags,
  listPlatformOrgs,
  PlatformOrg,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

export default function PlatformAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!s.isPlatformAdmin) {
      router.replace('/app');
      return;
    }
    setAllowed(true);
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [o, f] = await Promise.all([listPlatformOrgs(), listPlatformFlags()]);
        if (!cancelled) {
          setOrgs(o);
          setFlags(f);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load platform data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking platform access…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Platform Super Admin</p>
          <h1>Ellines operators</h1>
          <p className={styles.lede}>
            Tenants and feature flags for the EIP platform — not customer IT. Grant via{' '}
            <code>PLATFORM_ADMIN_EMAILS</code>.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      <div className={styles.kpis}>
        <article className={styles.kpi}>
          <span>Tenants</span>
          <strong>{loading ? '—' : String(orgs.length)}</strong>
          <em>Organizations</em>
        </article>
        <article className={styles.kpi}>
          <span>Feature flags</span>
          <strong>{loading ? '—' : String(flags.length)}</strong>
          <em>Scaffold only</em>
        </article>
        <article className={styles.kpi}>
          <span>Pages</span>
          <strong className={styles.ready}>Live</strong>
          <em className={styles.pos}>eip.ellines.co.ke</em>
        </article>
        <article className={styles.kpi}>
          <span>Identity</span>
          <strong>Hybrid</strong>
          <em>Pages Functions + Nest</em>
        </article>
      </div>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Tenants</div>
        {loading ? (
          <p className={styles.lede}>Loading…</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Users</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{o.slug}</td>
                  <td>{o.userCount}</td>
                  <td>{o.status}</td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Feature flags (placeholder)</div>
        {loading ? (
          <p className={styles.lede}>Loading…</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Flag</th>
                <th>State</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>{f.enabled ? 'On' : 'Off'}</td>
                  <td>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
