'use client';

import { useState, useEffect, useCallback } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  getSession,
  exportComplianceReport,
  fetchDataAccessLog,
  downloadDataAccessLog,
  type ComplianceTemplate,
  type ExportFormat,
  type DataAccessLogEntry,
  type DataAccessLogDto,
} from '@/lib/api';
import styles from '../command.module.css';

const FRAMEWORKS: { id: ComplianceTemplate; label: string; desc: string; controls: string }[] = [
  { id: 'soc2',  label: 'SOC 2 Type II',  desc: 'Access control, authentication, and change management.',   controls: 'CC6.1 · CC6.2 · CC6.3 · CC7.2 · CC8.1' },
  { id: 'hipaa', label: 'HIPAA Security', desc: 'Access and audit controls for healthcare data.',            controls: '164.312(b) · 164.312(d) · 164.312(e)' },
  { id: 'gdpr',  label: 'GDPR Art. 30',   desc: 'Records of processing activities and data access.',        controls: 'Art.30 · Art.32 · Art.33' },
  { id: 'pci',   label: 'PCI DSS',        desc: 'Authentication, data access, and system event logs.',      controls: 'Req 10.2 · 10.3 · 10.4' },
  { id: 'all',   label: 'All Frameworks', desc: 'Complete audit log covering all four frameworks.',         controls: 'SOC2 · HIPAA · GDPR · PCI-DSS' },
];

const RESOURCE_CATS = ['', 'connector', 'report', 'document', 'export', 'api_key', 'authentication', 'org_data'];
const SENS_COLOR: Record<string, string> = { high: '#f87171', medium: '#fbbf24', low: '#6ee7b7' };

function todayStr() { return new Date().toISOString().split('T')[0]; }
function daysAgoStr(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; }

export default function CompliancePage() {
  const session = getSession();
  const isAdmin = session ? isOrgAdminRole(session.user.role) : false;
  const [tab, setTab] = useState<'export' | 'access'>('export');

  // Export tab
  const [template, setTemplate] = useState<ComplianceTemplate>('all');
  const [fmt, setFmt] = useState<ExportFormat>('csv');
  const [expFrom, setExpFrom] = useState(daysAgoStr(90));
  const [expTo, setExpTo] = useState(todayStr());
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [lastExport, setLastExport] = useState('');

  // Access log tab
  const [log, setLog] = useState<DataAccessLogDto | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [logFrom, setLogFrom] = useState(daysAgoStr(30));
  const [logTo, setLogTo] = useState(todayStr());
  const [dlBusy, setDlBusy] = useState(false);

  const loadLog = useCallback(() => {
    setLogLoading(true); setLogError('');
    fetchDataAccessLog({ limit: 200, resource: catFilter || undefined, from: logFrom, to: logTo })
      .then(setLog).catch(e => setLogError(e.message)).finally(() => setLogLoading(false));
  }, [catFilter, logFrom, logTo]);

  useEffect(() => { if (tab === 'access') loadLog(); }, [tab, loadLog]);

  if (!isAdmin) {
    return <main className={styles.main}><div className={styles.container}><p className={styles.lede}>Access restricted to Owner and IT Admin.</p></div></main>;
  }

  async function doExport() {
    setExportBusy(true); setExportError('');
    try {
      const blob = await exportComplianceReport({ template, format: fmt, from: expFrom, to: expTo });
      const ext = fmt === 'json' ? 'json' : 'csv';
      const fn = `compliance_${template}_${expTo}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fn; a.click();
      URL.revokeObjectURL(url);
      setLastExport(`${FRAMEWORKS.find(f => f.id === template)!.label} at ${new Date().toLocaleString()}`);
    } catch (e) { setExportError(e instanceof Error ? e.message : 'Export failed'); }
    finally { setExportBusy(false); }
  }

  async function doDownloadLog() {
    setDlBusy(true);
    try {
      const blob = await downloadDataAccessLog({ resource: catFilter || undefined, from: logFrom, to: logTo });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `data_access_${logTo}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setLogError(e instanceof Error ? e.message : 'Download failed'); }
    finally { setDlBusy(false); }
  }

  const selectedLabel = FRAMEWORKS.find(f => f.id === template)!.label;

  return (
    <main className={styles.main}>
      <div className={styles.container}>

        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>Governance &amp; Compliance</p>
          <h1 className={styles.heading}>Compliance Center</h1>
          <p className={styles.lede}>Export compliance reports and review data access logs for SOC 2, HIPAA, GDPR, and PCI-DSS audits.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {(['export', 'access'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ padding: '0.5rem 1.1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', borderBottom: `2px solid ${tab === t ? '#7c3aed' : 'transparent'}`, color: tab === t ? '#c4b5fd' : 'var(--c-muted)', marginBottom: '-1px' }}>
              {t === 'export' ? 'Compliance Export' : 'Data Access Log'}
            </button>
          ))}
        </div>

        {/* ── EXPORT TAB ── */}
        {tab === 'export' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: '0.65rem', marginBottom: '1.25rem' }}>
              {FRAMEWORKS.map(f => (
                <button key={f.id} type="button" onClick={() => setTemplate(f.id)}
                  style={{ textAlign: 'left', padding: '0.8rem 0.9rem', borderRadius: 10, border: `2px solid ${template === f.id ? 'rgba(111,45,141,0.7)' : 'rgba(255,255,255,0.08)'}`, background: template === f.id ? 'rgba(111,45,141,0.12)' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: template === f.id ? '#c4b5fd' : '#f4f7fb', marginBottom: '0.2rem' }}>{f.label}</div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--c-muted)', marginBottom: '0.25rem', lineHeight: 1.4 }}>{f.desc}</div>
                  <div style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: template === f.id ? '#a78bfa' : '#475569' }}>{f.controls}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format</label>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {(['csv', 'json'] as ExportFormat[]).map(f => (
                    <button key={f} type="button" onClick={() => setFmt(f)}
                      style={{ padding: '0.28rem 0.7rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: `1px solid ${fmt === f ? 'rgba(111,45,141,0.6)' : 'rgba(255,255,255,0.1)'}`, background: fmt === f ? 'rgba(111,45,141,0.2)' : 'transparent', color: fmt === f ? '#c4b5fd' : 'var(--c-muted)' }}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From</label>
                <input type="date" value={expFrom} onChange={e => setExpFrom(e.target.value)}
                  style={{ padding: '0.3rem 0.55rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#f4f7fb', fontSize: '0.8rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>To</label>
                <input type="date" value={expTo} onChange={e => setExpTo(e.target.value)}
                  style={{ padding: '0.3rem 0.55rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#f4f7fb', fontSize: '0.8rem' }} />
              </div>
              <button type="button" onClick={doExport} disabled={exportBusy}
                style={{ padding: '0.42rem 1.25rem', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', background: exportBusy ? 'rgba(111,45,141,0.3)' : 'rgba(111,45,141,0.8)', border: '1px solid rgba(111,45,141,0.6)', color: '#f4f7fb', cursor: exportBusy ? 'not-allowed' : 'pointer', marginLeft: 'auto' }}>
                {exportBusy ? 'Generating…' : `Download ${selectedLabel}`}
              </button>
            </div>

            {exportError ? <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{exportError}</p> : null}
            {lastExport ? <div style={{ padding: '0.55rem 0.9rem', borderRadius: 8, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: '1rem', fontSize: '0.8rem', color: '#6ee7b7' }}>✓ {lastExport} — logged in audit trail.</div> : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.65rem' }}>
              {[
                { icon: '🔒', title: 'What is included', body: 'Authentication, role changes, API keys, connector syncs, data exports, document access, and config changes.' },
                { icon: '📋', title: 'Auditor use', body: 'Hand the CSV to your auditor or upload to your GRC tool. Each record has timestamp, actor, action, and resource.' },
                { icon: '⏱', title: 'Date range', body: 'Default 90 days. For annual SOC 2 use Jan 1 – Dec 31. Max 2,000 records per export.' },
                { icon: '🗂', title: 'Evidence pack', body: 'Export All Frameworks then individual frameworks per control area. All exports are audit-logged.' },
              ].map(({ icon, title, body }) => (
                <div key={title} style={{ padding: '0.8rem 0.9rem', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: '1rem', marginBottom: '0.3rem' }}>{icon}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f4f7fb', marginBottom: '0.2rem' }}>{title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--c-muted)', lineHeight: 1.5 }}>{body}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── ACCESS LOG TAB ── */}
        {tab === 'access' && (
          <>
            {log && (
              <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
                {([['Total events', log.total, '#94a3b8'], ['High sensitivity', log.summary.highSensitivity, '#f87171'], ['Medium', log.summary.mediumSensitivity, '#fbbf24']] as [string, number, string][]).map(([label, value, color]) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '0.45rem 0.85rem', minWidth: 110 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--c-muted)' }}>{label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</label>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#f4f7fb', fontSize: '0.8rem' }}>
                  {RESOURCE_CATS.map(c => <option key={c} value={c}>{c || 'All categories'}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</label>
                <input type="date" value={logFrom} onChange={e => setLogFrom(e.target.value)}
                  style={{ padding: '0.3rem 0.55rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#f4f7fb', fontSize: '0.8rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
                <input type="date" value={logTo} onChange={e => setLogTo(e.target.value)}
                  style={{ padding: '0.3rem 0.55rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#f4f7fb', fontSize: '0.8rem' }} />
              </div>
              <button type="button" onClick={loadLog} disabled={logLoading}
                style={{ padding: '0.32rem 0.85rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#f4f7fb' }}>
                {logLoading ? 'Loading…' : '↻ Refresh'}
              </button>
              <button type="button" onClick={doDownloadLog} disabled={dlBusy}
                style={{ padding: '0.32rem 0.85rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(111,45,141,0.5)', background: 'rgba(111,45,141,0.15)', color: '#c4b5fd', marginLeft: 'auto' }}>
                {dlBusy ? 'Downloading…' : 'Download CSV'}
              </button>
            </div>

            {logError ? <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{logError}</p> : null}

            {logLoading ? (
              <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem' }}>Loading…</p>
            ) : !log || log.logs.length === 0 ? (
              <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem' }}>No data access events in this range.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Sensitivity', 'Time', 'Actor', 'Action', 'Resource', 'Category'].map(h => (
                        <th key={h} style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: 'var(--c-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {log.logs.map((r: DataAccessLogEntry) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '0.38rem 0.5rem' }}>
                          <span style={{ padding: '0.08rem 0.4rem', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, color: SENS_COLOR[r.sensitivity] ?? '#94a3b8', background: `${SENS_COLOR[r.sensitivity] ?? '#94a3b8'}18`, border: `1px solid ${SENS_COLOR[r.sensitivity] ?? '#94a3b8'}33` }}>
                            {r.sensitivity}
                          </span>
                        </td>
                        <td style={{ padding: '0.38rem 0.5rem', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>{new Date(r.timestamp).toLocaleString()}</td>
                        <td style={{ padding: '0.38rem 0.5rem', color: '#f4f7fb', whiteSpace: 'nowrap' }} title={r.actorUserId}>{r.actorEmail}</td>
                        <td style={{ padding: '0.38rem 0.5rem', color: '#f4f7fb', fontFamily: 'monospace', fontSize: '0.72rem' }}>{r.action}</td>
                        <td style={{ padding: '0.38rem 0.5rem', color: 'var(--c-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.resource || '—'}</td>
                        <td style={{ padding: '0.38rem 0.5rem' }}>
                          <span style={{ padding: '0.08rem 0.4rem', borderRadius: 99, fontSize: '0.65rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'var(--c-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {r.resourceCategory}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>
    </main>
  );
}
