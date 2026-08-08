'use client';

import { useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { getSession, exportComplianceReport, type ComplianceTemplate, type ExportFormat } from '@/lib/api';
import styles from '../command.module.css';

const TEMPLATES: { id: ComplianceTemplate; label: string; desc: string; controls: string }[] = [
  {
    id: 'soc2',
    label: 'SOC 2 Type II',
    desc: 'Access control, authentication, and change management events.',
    controls: 'CC6.1 · CC6.2 · CC6.3 · CC7.2 · CC8.1',
  },
  {
    id: 'hipaa',
    label: 'HIPAA Security Rule',
    desc: 'Access and audit controls for healthcare data handling.',
    controls: '164.312(b) · 164.312(d) · 164.312(e)',
  },
  {
    id: 'gdpr',
    label: 'GDPR Article 30',
    desc: 'Records of processing activities and data access events.',
    controls: 'Art.30 · Art.32 · Art.33',
  },
  {
    id: 'pci',
    label: 'PCI DSS',
    desc: 'Authentication, data access, and system event logs.',
    controls: 'Req 10.2 · 10.3 · 10.4',
  },
  {
    id: 'all',
    label: 'All Frameworks',
    desc: 'Complete audit log covering all four compliance frameworks.',
    controls: 'SOC2 · HIPAA · GDPR · PCI-DSS',
  },
];

export default function CompliancePage() {
  const session = getSession();
  const isAdmin = session ? isOrgAdminRole(session.user.role) : false;

  const [template, setTemplate] = useState<ComplianceTemplate>('all');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastExport, setLastExport] = useState<{ template: string; at: string } | null>(null);

  if (!isAdmin) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <p className={styles.lede}>Access restricted to Owner and IT Admin.</p>
        </div>
      </main>
    );
  }

  async function handleExport() {
    setBusy(true);
    setError('');
    try {
      const blob = await exportComplianceReport({
        template,
        format,
        from: fromDate,
        to: toDate,
      });
      const ext = format === 'json' ? 'json' : 'csv';
      const filename = `compliance_${template}_${toDate}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport({ template, at: new Date().toLocaleString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  const selected = TEMPLATES.find((t) => t.id === template)!;

  return (
    <main className={styles.main}>
      <div className={styles.container}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>
            Governance &amp; Compliance
          </p>
          <h1 className={styles.heading}>Compliance Audit Export</h1>
          <p className={styles.lede}>
            Export audit logs formatted for SOC 2, HIPAA, GDPR, or PCI-DSS compliance reviews.
            Records include all user actions, authentication events, data access, and system changes.
          </p>
        </div>

        {/* Framework picker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              style={{
                textAlign: 'left',
                padding: '0.85rem 1rem',
                borderRadius: 10,
                border: `2px solid ${template === t.id ? 'rgba(111,45,141,0.7)' : 'rgba(255,255,255,0.08)'}`,
                background: template === t.id ? 'rgba(111,45,141,0.12)' : 'rgba(255,255,255,0.03)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: template === t.id ? '#c4b5fd' : '#f4f7fb', marginBottom: '0.25rem' }}>
                {t.label}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--c-muted)', marginBottom: '0.3rem', lineHeight: 1.4 }}>
                {t.desc}
              </div>
              <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: template === t.id ? '#a78bfa' : '#64748b' }}>
                {t.controls}
              </div>
            </button>
          ))}
        </div>

        {/* Options row */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(['csv', 'json'] as ExportFormat[]).map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  style={{
                    padding: '0.3rem 0.8rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
                    cursor: 'pointer', border: '1px solid',
                    borderColor: format === f ? 'rgba(111,45,141,0.6)' : 'rgba(255,255,255,0.1)',
                    background: format === f ? 'rgba(111,45,141,0.2)' : 'transparent',
                    color: format === f ? '#c4b5fd' : 'var(--c-muted)',
                  }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              style={{ padding: '0.35rem 0.6rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#f4f7fb', fontSize: '0.82rem' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              style={{ padding: '0.35rem 0.6rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#f4f7fb', fontSize: '0.82rem' }} />
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            style={{
              padding: '0.45rem 1.4rem', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem',
              background: busy ? 'rgba(111,45,141,0.3)' : 'rgba(111,45,141,0.8)',
              border: '1px solid rgba(111,45,141,0.6)', color: '#f4f7fb',
              cursor: busy ? 'not-allowed' : 'pointer', marginLeft: 'auto',
            }}
          >
            {busy ? 'Generating…' : `Download ${selected.label}`}
          </button>
        </div>

        {/* Error */}
        {error ? (
          <p style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '1rem' }}>{error}</p>
        ) : null}

        {/* Last export notice */}
        {lastExport ? (
          <div style={{ padding: '0.6rem 1rem', borderRadius: 8, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: '1.5rem', fontSize: '0.82rem', color: '#6ee7b7' }}>
            ✓ {lastExport.template.toUpperCase()} report downloaded at {lastExport.at}. Export logged in audit trail.
          </div>
        ) : null}

        {/* Info boxes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {[
            { icon: '🔒', title: 'What is included', body: 'All authentication events, login/logout, password changes, SSO, role changes, API key usage, data exports, connector syncs, and system configuration changes.' },
            { icon: '📋', title: 'Auditor use', body: 'Hand the downloaded file directly to your auditor or upload to your GRC tool. Each record includes timestamp, actor email, action, and resource.' },
            { icon: '⏱', title: 'Date range', body: 'Default is 90 days. For annual SOC 2 reports set from Jan 1 to Dec 31. Maximum 2,000 records per export — narrow the date range for large orgs.' },
            { icon: '🗂', title: 'Evidence pack', body: 'For a full evidence pack: export All Frameworks as CSV, then export individual frameworks for each control area. All exports are audit-logged.' },
          ].map(({ icon, title, body }) => (
            <div key={title} style={{ padding: '0.85rem 1rem', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>{icon}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f4f7fb', marginBottom: '0.25rem' }}>{title}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', lineHeight: 1.5 }}>{body}</div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}
