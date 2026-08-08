'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import { getSession, exportOrgData, type ExportFormat, type ExportType } from '@/lib/api';
import styles from '../admin/admin.module.css';

export default function ExportsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [type, setType] = useState<ExportType>('uem');
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
    setAllowed(true);
  }, [router]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 5000);
  }

  async function handleExport(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    flash('Generating export...');

    try {
      const blob = await exportOrgData(type, format);

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ellines_${type}_export_${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      flash('Export downloaded successfully.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <div className={styles.page}><p>Checking access…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Data Management</p>
          <h1>Bulk Export</h1>
          <p className={styles.lede}>Export UEM objects, timeline events, and approval workflows for backup or analysis.</p>
        </div>
        <Link href="/app" className={styles.ghostBtn}>← Back to app</Link>
      </header>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.brief}>
        <form onSubmit={handleExport}>
          <div className={styles.formGrid}>
            <label>
              <span>Export type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ExportType)}
                disabled={busy}
              >
                <option value="uem">UEM Objects (people, branches, departments, assets)</option>
                <option value="timeline">Timeline Events (all activity history)</option>
                <option value="approvals">Approval Workflows (requests & decisions)</option>
                <option value="all">All Data (complete export)</option>
              </select>
            </label>

            <label>
              <span>Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                disabled={busy}
              >
                <option value="csv">CSV (Excel-compatible)</option>
                <option value="json">JSON (developer-friendly)</option>
              </select>
            </label>
          </div>

          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? '⏳ Generating...' : '⬇ Download Export'}
          </button>
        </form>

        <div className={styles.helpText} style={{ marginTop: '2rem', padding: '1rem', background: '#0f172a', borderRadius: '6px', border: '1px solid #1e293b' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Export Details</h3>
          <ul style={{ fontSize: '0.85rem', lineHeight: '1.6', color: '#94a3b8', paddingLeft: '1.25rem' }}>
            <li><strong>UEM Objects:</strong> People, branches, departments, assets, metadata</li>
            <li><strong>Timeline:</strong> All activity events with timestamps and actors</li>
            <li><strong>Approvals:</strong> Requests, decisions, status, and approval chains</li>
            <li><strong>CSV format:</strong> One row per entity, Excel-compatible</li>
            <li><strong>JSON format:</strong> Nested structure, preserves relationships</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
