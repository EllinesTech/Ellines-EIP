'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, fetchEnterpriseSummary, type EnterpriseSummaryDto } from '@/lib/api';
import styles from '../../command.module.css';

export default function BusinessPerformancePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set when the summary request fails, so we can say so rather than show an empty page. */
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSession()) { router.replace('/login'); return; }
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not reach the data source'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className={styles.page} style={{ padding: '2rem' }}><p style={{ color: '#8b95a8' }}>Loading…</p></div>;

  const timeline = summary?.timeline ?? [];

  // A failed load is NOT an empty result set. Saying "no performance data" when
  // the source was unreachable would present an outage as a business finding.
  if (loadError) {
    return (
      <div className={styles.page} style={{ padding: '2rem' }}>
        <p role="alert" style={{ color: '#d97706' }}>
          Performance data is unavailable: {loadError}. No reading is being shown because none
          could be retrieved.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Business · Performance</p>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Performance</h1>
          <p className={styles.lede}>Enterprise performance trends from connected systems.</p>
        </div>
      </header>

      {timeline.length === 0 ? (
        <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#8b95a8' }}>
          <p style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>No performance data yet</p>
          <p style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>Connect an ERP, CRM, or finance system to see trend data here.</p>
        </div>
      ) : (
        <div style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          {timeline.map((item, i) => (
            <div key={i} style={{ padding: '0.75rem 1rem', borderBottom: i < timeline.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', flexShrink: 0, marginTop: 5 }} aria-hidden />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f4f7fb' }}>{item.title}</div>
                <div style={{ fontSize: '0.78rem', color: '#8b95a8', marginTop: 2 }}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
