'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  askEllineaApi,
  fetchEllineaMemory,
  fetchOrgDataWindow,
  getSession,
  type EllineaMemoryNoteDto,
  type OrgDataEmailDto,
  type OrgDataReportDto,
  type OrgDataWindowDto,
} from '@/lib/api';
import { isOrgAdminRole } from '@ellines-eip/shared';
import styles from '../command.module.css';

type Tab = 'emails' | 'reports' | 'connectors';

const PRIORITY_BADGE: Record<OrgDataEmailDto['priority'], string | null> = {
  high: 'Urgent',
  normal: null,
  low: null,
};

export default function OrgDataWindowPage() {
  const [data, setData] = useState<OrgDataWindowDto | null>(null);
  const [memory, setMemory] = useState<EllineaMemoryNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('emails');
  const [emailSearch, setEmailSearch] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [role, setRole] = useState('member');
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setOrgAdmin(isOrgAdminRole(s.user.role));
    setRole(s.user.role);
    Promise.all([
      fetchOrgDataWindow().catch(() => null),
      fetchEllineaMemory().catch(() => [] as EllineaMemoryNoteDto[]),
    ]).then(([d, m]) => {
      setData(d);
      setMemory(m);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const emails = useMemo(() => {
    if (!data) return [];
    const q = emailSearch.trim().toLowerCase();
    return q
      ? data.emails.filter((e) => `${e.subject} ${e.from} ${e.preview}`.toLowerCase().includes(q))
      : data.emails;
  }, [data, emailSearch]);

  const reports = useMemo(() => {
    if (!data) return [];
    const q = reportSearch.trim().toLowerCase();
    return q
      ? data.reports.filter((r) => `${r.title} ${r.source}`.toLowerCase().includes(q))
      : data.reports;
  }, [data, reportSearch]);

  async function askEllinea(context: string, prompt: string) {
    if (!data) return;
    setAiBusy(true); setAiText(''); setAiError('');
    try {
      const res = await askEllineaApi({
        question: prompt,
        summary: null,
        memory,
        templateAnswer: context,
        role,
      });
      setAiText(res.answer);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setAiBusy(false);
    }
  }

  function downloadReport(report: OrgDataReportDto) {
    const content = report.content || report.title;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  }

  const tabStyle = (t: Tab) => ({
    padding: '0.35rem 0.85rem',
    borderRadius: 6,
    border: tab === t ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.1)',
    background: tab === t ? 'rgba(124,58,237,0.18)' : 'transparent',
    color: tab === t ? '#c4b5fd' : 'var(--c-muted)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.82rem',
  });

  const unreadCount = data?.emails.filter((e) => e.unread).length ?? 0;
  const urgentCount = data?.emails.filter((e) => e.priority === 'high').length ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Organization Intelligence</p>
          <h1>Organization Data Window</h1>
          <p className={styles.lede}>
            Unified view of emails, reports, and documents pulled from connected Systems of Record.
            EIP wraps and surfaces SoR data — it never writes back to them.
          </p>
        </div>
        <div className={styles.headerActions}>
          {orgAdmin ? <Link href="/app/connectors" className={styles.ghostBtn}>Connectors</Link> : null}
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
          <Link href="/app/org-system" className={styles.ghostBtn}>Organization System</Link>
        </div>
      </header>

      {error ? <div className={styles.emptyCallout} role="alert"><div><strong>Error</strong><p>{error}</p></div></div> : null}

      {/* Ellinea AI summary strip */}
      {(aiText || aiError) && (
        <section className={styles.aiCard} style={{ marginBottom: '1rem' }}>
          <span className={styles.aiBadge}>✦ Ellinea AI Summary</span>
          {aiError ? <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginTop: '0.4rem' }}>{aiError}</p> : null}
          {aiText ? <p style={{ marginTop: '0.4rem', fontSize: '0.88rem', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{aiText}</p> : null}
        </section>
      )}

      {/* KPIs */}
      {data && (
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span>Emails</span>
            <strong className={urgentCount ? styles.warn : undefined}>{data.emails.length}</strong>
            <em>{unreadCount} unread · {urgentCount} urgent</em>
          </div>
          <div className={styles.kpi}>
            <span>Reports</span>
            <strong>{data.reports.length}</strong>
            <em>From connected systems</em>
          </div>
          <div className={styles.kpi}>
            <span>Connectors</span>
            <strong>{data.connectors.length}</strong>
            <em>{data.connectors.filter(c => c.status === 'synced').length} synced</em>
          </div>
          <div className={styles.kpi}>
            <span>Last sync</span>
            <strong>{data.syncedAt ? new Date(data.syncedAt).toLocaleTimeString() : '—'}</strong>
            <em>{data.syncedAt ? new Date(data.syncedAt).toLocaleDateString() : 'Not synced'}</em>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTab('emails')} style={tabStyle('emails')}>Emails ({data?.emails.length ?? 0})</button>
        <button type="button" onClick={() => setTab('reports')} style={tabStyle('reports')}>Reports ({data?.reports.length ?? 0})</button>
        <button type="button" onClick={() => setTab('connectors')} style={tabStyle('connectors')}>Connectors ({data?.connectors.length ?? 0})</button>
      </div>

      {/* ── Emails Tab ──────────────────────────────────────────────────────── */}
      {tab === 'emails' && (
        <section>
          <div className={styles.panelLabel} style={{ marginBottom: '0.5rem' }}>
            Work Email — from connected email connector
          </div>
          {!loading && !data?.emails.length ? (
            <div className={styles.emptyCallout}>
              <div>
                <strong>No emails in current snapshot</strong>
                <p>
                  Install and sync an Email (IMAP) connector under Connectors. Once synced,
                  Ellinea surfaces email highlights here for the whole organization.
                </p>
              </div>
              {orgAdmin ? <Link href="/app/connectors" className={styles.aiBtn}>Install Email Connector</Link> : null}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={emailSearch}
                  onChange={(e) => setEmailSearch(e.target.value)}
                  placeholder="Search emails…"
                  style={{ flex: 1, minWidth: 200, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  className={styles.aiBtn}
                  disabled={aiBusy}
                  onClick={() => askEllinea(
                    emails.slice(0, 8).map(e => `• ${e.subject} (${e.from}): ${e.preview}`).join('\n'),
                    'Summarize the most important work emails and flag anything urgent.',
                  )}
                >
                  {aiBusy ? 'Thinking…' : '✦ Ellinea Email Summary'}
                </button>
              </div>
              {loading ? <p className={styles.lede}>Loading emails…</p> : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {emails.map((email) => (
                  <article key={email.id} className={styles.card}
                    style={{ padding: '0.8rem 1rem', display: 'flex', gap: '0.75rem',
                      borderLeft: email.unread ? '3px solid rgba(124,58,237,0.7)' : '3px solid transparent' }}>
                    <div aria-hidden style={{ width: 36, height: 36, borderRadius: '50%', background: email.priority === 'high' ? 'rgba(239,68,68,0.18)' : 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                      {email.priority === 'high' ? '🔴' : '✉️'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.15rem' }}>
                        <span style={{ fontWeight: email.unread ? 800 : 600, fontSize: '0.88rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</span>
                        {email.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} aria-label="unread" />}
                        {PRIORITY_BADGE[email.priority] && (
                          <span style={{ padding: '0.1rem 0.4rem', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
                            {PRIORITY_BADGE[email.priority]}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginBottom: '0.2rem' }}>From: {email.from} · {new Date(email.at).toLocaleString()}</div>
                      <div style={{ fontSize: '0.8rem', color: '#c5cddb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.preview}</div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--c-muted)' }}>via {email.source}</span>
                      <button type="button"
                        onClick={() => askEllinea(`Subject: ${email.subject}\nFrom: ${email.from}\n${email.preview}`, `Summarize this email and suggest a response action: "${email.subject}"`)}
                        style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 6, color: '#c4b5fd', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.72rem' }}
                      >✦ Summarize</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Reports Tab ─────────────────────────────────────────────────────── */}
      {tab === 'reports' && (
        <section>
          <div className={styles.panelLabel} style={{ marginBottom: '0.5rem' }}>
            Reports &amp; Exports — from connected systems + EIP scheduled reports
          </div>
          {!loading && !data?.reports.length ? (
            <div className={styles.emptyCallout}>
              <div>
                <strong>No reports yet</strong>
                <p>
                  Run a scheduled report from <Link href="/app/reports" style={{ color: 'var(--c-blue)' }}>Scheduled Reports</Link>,
                  or sync a connector that surfaces report/export objects.
                </p>
              </div>
              <Link href="/app/reports" className={styles.ghostBtn}>Go to Reports</Link>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="Search reports…"
                  style={{ flex: 1, minWidth: 200, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
                />
                <button type="button" className={styles.aiBtn} disabled={aiBusy}
                  onClick={() => askEllinea(
                    reports.slice(0, 6).map(r => `• ${r.title} (${r.source}, ${r.generatedAt.slice(0,10)})`).join('\n'),
                    'Summarize the key insights from these reports and highlight anything important.',
                  )}>
                  {aiBusy ? 'Thinking…' : '✦ Ellinea Report Summary'}
                </button>
              </div>
              {loading ? <p className={styles.lede}>Loading reports…</p> : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {reports.map((report) => (
                  <article key={report.id} className={styles.card} style={{ padding: '0.8rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div aria-hidden style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(37,99,235,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>📄</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>
                        {report.source} · {new Date(report.generatedAt).toLocaleString()}
                        {report.sizeKb ? ` · ${report.sizeKb} KB` : ''}
                      </div>
                      {report.content && (
                        <div style={{ fontSize: '0.78rem', color: '#c5cddb', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.content}</div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
                      <button type="button" onClick={() => downloadReport(report)}
                        style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.35)', borderRadius: 6, color: '#93c5fd', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.72rem' }}>
                        ↓ Download
                      </button>
                      <button type="button"
                        onClick={() => copyText(report.content || report.title, report.id)}
                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'var(--c-muted)', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.72rem' }}>
                        {copiedKey === report.id ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Connectors Tab ──────────────────────────────────────────────────── */}
      {tab === 'connectors' && (
        <section>
          <div className={styles.panelLabel} style={{ marginBottom: '0.5rem' }}>
            Connected Systems — data sources feeding this window
          </div>
          {!loading && !data?.connectors.length ? (
            <div className={styles.emptyCallout}>
              <div>
                <strong>No connectors installed</strong>
                <p>Owner / IT Admin installs connectors to pull data from ERP, CRM, email, and other systems.</p>
              </div>
              {orgAdmin ? <Link href="/app/connectors" className={styles.aiBtn}>Install Connector</Link> : null}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(data?.connectors ?? []).map((c) => {
                const statusColor = c.status === 'synced' ? '#10b981' : c.status === 'error' ? '#ef4444' : '#64748b';
                return (
                  <div key={c.id} className={styles.card} style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0 }} aria-hidden />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{c.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>
                        {c.type} · {c.status}
                        {c.lastSyncedAt ? ` · Last sync: ${new Date(c.lastSyncedAt).toLocaleString()}` : ' · Never synced'}
                      </div>
                    </div>
                    {orgAdmin && (
                      <Link href="/app/connectors" style={{ fontSize: '0.78rem', color: 'var(--c-blue)', textDecoration: 'none' }}>Manage →</Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className={styles.emptyCallout} style={{ marginTop: '1rem', background: 'rgba(124,58,237,0.07)', borderColor: 'rgba(124,58,237,0.25)' }}>
            <div>
              <strong>EIP observes — it never writes back</strong>
              <p>
                The Organization Data Window surfaces read-only data from your Systems of Record.
                ERP, CRM, HIS, and email systems remain unchanged. EIP is an intelligence layer above them.
              </p>
            </div>
            <Link href="/app/org-system" className={styles.ghostBtn}>Organization System →</Link>
          </div>
        </section>
      )}

      {/* Bottom Ellinea tip */}
      <div className={styles.emptyCallout} style={{ marginTop: '1.5rem', background: 'rgba(124,58,237,0.07)', borderColor: 'rgba(124,58,237,0.25)' }}>
        <div>
          <strong>Ask Ellinea about your organization data</strong>
          <p>
            "Summarize important emails this week" · "What reports need attention?" ·
            "Which connectors are behind on sync?" · "Flag any urgent items from external systems."
          </p>
        </div>
        <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea →</Link>
      </div>
    </div>
  );
}
