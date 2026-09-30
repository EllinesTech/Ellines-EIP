'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, listReportsApi, type ScheduledReportDto } from '@/lib/api';
import styles from '../../command.module.css';

export default function BusinessReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ScheduledReportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getSession()) { router.replace('/login'); return; }
    listReportsApi().then(setReports).catch((e) => setError(e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className={styles.page} style={{ padding: '2rem' }}><p style={{ color: '#8b95a8' }}>Loading reports…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Business · Reports</p>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Reports</h1>
          <p className={styles.lede}>Scheduled and on-demand reports from connected systems.</p>
        </div>
      </header>
      {error && <div role="alert" style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}
      {reports.length === 0 ? (
        <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#8b95a8' }}>
          <p style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>No reports yet</p>
          <p style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>Configure scheduled reports via a connected email or ERP connector.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {reports.map((r) => (
            <div key={r.id} style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f4f7fb' }}>{r.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#8b95a8', marginTop: 2 }}>{r.cadence} · Next {r.nextRunHint}</div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: r.enabled ? '#10b981' : '#8b95a8', textTransform: 'uppercase' }}>{r.enabled ? 'Active' : 'Paused'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
