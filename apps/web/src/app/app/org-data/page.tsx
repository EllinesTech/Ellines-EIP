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
  high: 'Urgent', normal: null, low: null,
};

/** Generate styled HTML for a report download (S7.5) */
function buildReportHtml(report: OrgDataReportDto, orgName: string): string {
  const content = (report.content || report.title).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const date = new Date(report.generatedAt).toLocaleString();
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${report.title} â€” ${orgName}</title>
<style>
  body{font-family:'Segoe UI',sans-serif;max-width:820px;margin:40px auto;padding:0 24px;color:#0f172a;background:#fff}
  .hdr{border-bottom:3px solid #6F2D8D;padding-bottom:16px;margin-bottom:28px}
  .brand{font-size:11px;font-weight:700;color:#6F2D8D;letter-spacing:.1em;text-transform:uppercase}
  h1{margin:8px 0 4px;font-size:22px;font-weight:800}
  .meta{font-size:12px;color:#64748b}
  .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f3e8ff;color:#6F2D8D;border:1px solid #e9d5ff;margin-left:8px}
  .body{font-size:14px;line-height:1.7;white-space:pre-line;color:#1e293b;margin-top:24px}
  .ft{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
  @media print{body{margin:0}}
</style></head><body>
<div class="hdr">
  <div class="brand">Ellines EIP â€” ${orgName}</div>
  <h1>${report.title}</h1>
  <div class="meta">Generated: ${date}<span class="badge">${report.source}</span></div>
</div>
<div class="body">${content}</div>
<div class="ft">Ellines EIP Â· Enterprise Intelligence Platform Â· Where Enterprise Systems Think Together.</div>
</body></html>`;
}

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
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('My Organization');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setOrgAdmin(isOrgAdminRole(s.user.role));
    setRole(s.user.role);
    setOrgName(s.organization.name);
    setUserEmail(s.user.email);
    Promise.all([
      fetchOrgDataWindow().catch(() => null),
      fetchEllineaMemory().catch(() => [] as EllineaMemoryNoteDto[]),
    ]).then(([d, m]) => { setData(d); setMemory(m); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const emails = useMemo(() => {
    if (!data) return [];
    const q = emailSearch.trim().toLowerCase();
    return q ? data.emails.filter((e) => `${e.subject} ${e.from} ${e.preview}`.toLowerCase().includes(q)) : data.emails;
  }, [data, emailSearch]);

  const reports = useMemo(() => {
    if (!data) return [];
    const q = reportSearch.trim().toLowerCase();
    return q ? data.reports.filter((r) => `${r.title} ${r.source}`.toLowerCase().includes(q)) : data.reports;
  }, [data, reportSearch]);

  async function askEllinea(context: string, prompt: string) {
    setAiBusy(true); setAiText(''); setAiError('');
    try {
      const res = await askEllineaApi({ question: prompt, summary: null, memory, templateAnswer: context, role });
      setAiText(res.answer);
    } catch (e) { setAiError(e instanceof Error ? e.message : 'AI request failed'); }
    finally { setAiBusy(false); }
  }

  function downloadReportHtml(report: OrgDataReportDto) {
    const html = buildReportHtml(report, orgName);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadReportText(report: OrgDataReportDto) {
    const blob = new Blob([report.content || report.title], { type: 'text/plain' });
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

  function printReport(report: OrgDataReportDto) {
    const html = buildReportHtml(report, orgName);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  }

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '0.35rem 0.85rem', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
    border: tab === t ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.1)',
    background: tab === t ? 'rgba(124,58,237,0.18)' : 'transparent',
    color: tab === t ? '#c4b5fd' : 'var(--c-muted)',
  });

  const unreadCount = data?.emails.filter((e) => e.unread).length ?? 0;
  const urgentCount = data?.emails.filter((e) => e.priority === 'high').length ?? 0;
  const syncedConnectors = data?.connectors.filter((c) => c.status === 'synced').length ?? 0;

  return (
    <div className={styles.page}>
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Organization Intelligence Â· SoR Data Surface</p>
          <h1>Organization Data Window</h1>
          <p className={styles.lede}>
            Read-only view of data pulled from connected Systems of Record â€” emails, reports, connectors.
            EIP observes and surfaces; it never writes back to your SoR.
          </p>
        </div>
        <div className={styles.headerActions}>
          {orgAdmin && <Link href="/app/connectors" className={styles.ghostBtn}>Connectors</Link>}
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
          <Link href="/app/org-system" className={styles.ghostBtn}>Org System</Link>
        </div>
      </header>

      {/* â”€â”€ EIP-native vs SoR separator (S7.4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem', padding: '0.6rem 0.85rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6ee7b7', padding: '0.15rem 0.5rem', borderRadius: 99, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', whiteSpace: 'nowrap' }}>
          ðŸ“¡ SoR Data â€” this page
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>Emails, reports, and connector health from your connected systems</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--c-muted)' }}>
          EIP-native features â†’
        </span>
        <Link href="/app/approvals" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 99, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#c4b5fd', textDecoration: 'none', whiteSpace: 'nowrap' }}>Approvals</Link>
        <Link href="/app/automation" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 99, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#c4b5fd', textDecoration: 'none', whiteSpace: 'nowrap' }}>Agents</Link>
        <Link href="/app/rules" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 99, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#c4b5fd', textDecoration: 'none', whiteSpace: 'nowrap' }}>Rules</Link>
      </div>

      {error && <div className={styles.emptyCallout} role="alert"><div><strong>Error</strong><p>{error}</p></div></div>}

      {/* Ellinea AI answer strip */}
      {(aiText || aiError) && (
        <section className={styles.aiCard} style={{ marginBottom: '1rem' }}>
          <span className={styles.aiBadge}>âœ¦ Ellinea AI</span>
          {aiError && <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginTop: '0.4rem' }}>{aiError}</p>}
          {aiText && <p style={{ marginTop: '0.4rem', fontSize: '0.88rem', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{aiText}</p>}
        </section>
      )}

      {/* KPIs */}
      {data && (
        <div className={styles.kpis}>
          <div className={styles.kpi}><span>Emails</span><strong className={urgentCount ? styles.warn : undefined}>{data.emails.length}</strong><em>{unreadCount} unread Â· {urgentCount} urgent</em></div>
          <div className={styles.kpi}><span>Reports</span><strong>{data.reports.length}</strong><em>From connected systems</em></div>
          <div className={styles.kpi}><span>Connectors</span><strong>{data.connectors.length}</strong><em>{syncedConnectors} synced</em></div>
          <div className={styles.kpi}><span>Last sync</span><strong>{data.syncedAt ? new Date(data.syncedAt).toLocaleTimeString() : 'â€”'}</strong><em>{data.syncedAt ? new Date(data.syncedAt).toLocaleDateString() : 'Not synced'}</em></div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTab('emails')} style={tabStyle('emails')}>Emails ({data?.emails.length ?? 0})</button>
        <button type="button" onClick={() => setTab('reports')} style={tabStyle('reports')}>Reports ({data?.reports.length ?? 0})</button>
        <button type="button" onClick={() => setTab('connectors')} style={tabStyle('connectors')}>Connectors ({data?.connectors.length ?? 0})</button>
      </div>

      {/* â”€â”€ EMAILS TAB (S7.1 â€” expanded thread view, per-user inbox note) â”€â”€â”€ */}
      {tab === 'emails' && (
        <section>
          <div className={styles.panelLabel} style={{ marginBottom: '0.35rem' }}>Work Email â€” from connected email connector</div>
          {userEmail && (
            <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginBottom: '0.65rem' }}>
              Showing org-level inbox from synced connector. Emails are addressed to <strong style={{ color: '#c5cddb' }}>{userEmail}</strong> and their organisation.
              Click any thread to expand. EIP surfaces highlights â€” your actual email client remains your inbox.
            </p>
          )}
          {!loading && !data?.emails.length ? (
            <div className={styles.emptyCallout}>
              <div><strong>No emails in current snapshot</strong><p>Install and sync an Email (IMAP) connector under Connectors. Once synced, Ellinea surfaces email highlights here.</p></div>
              {orgAdmin && <Link href="/app/connectors" className={styles.aiBtn}>Install Email Connector</Link>}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={emailSearch} onChange={(e) => setEmailSearch(e.target.value)} placeholder="Search emailsâ€¦"
                  style={{ flex: 1, minWidth: 180, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }} />
                <button type="button" className={styles.aiBtn} disabled={aiBusy}
                  onClick={() => askEllinea(emails.slice(0,8).map(e=>`â€¢ ${e.subject} (${e.from}): ${e.preview}`).join('\n'), 'Summarize the most important work emails and flag anything urgent.')}>
                  {aiBusy ? 'Thinkingâ€¦' : 'âœ¦ Ellinea Summary'}
                </button>
              </div>
              {loading && <p className={styles.lede}>Loadingâ€¦</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {emails.map((email) => {
                  const expanded = expandedEmail === email.id;
                  return (
                    <article key={email.id} className={styles.card}
                      style={{ padding: '0.8rem 1rem', cursor: 'pointer', borderLeft: email.unread ? '3px solid rgba(124,58,237,0.7)' : '3px solid transparent' }}
                      onClick={() => setExpandedEmail(expanded ? null : email.id)}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <div aria-hidden style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: email.priority === 'high' ? 'rgba(239,68,68,0.18)' : 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                          {email.priority === 'high' ? 'ðŸ”´' : 'âœ‰ï¸'}
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
                            <span style={{ fontSize: '0.7rem', color: 'var(--c-muted)', flexShrink: 0 }}>{expanded ? 'â–²' : 'â–¼'}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>From: {email.from} Â· {new Date(email.at).toLocaleString()} Â· via {email.source}</div>
                          {!expanded && <div style={{ fontSize: '0.8rem', color: '#c5cddb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.15rem' }}>{email.preview}</div>}
                        </div>
                      </div>
                      {/* Expanded body (S7.1) */}
                      {expanded && (
                        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
                          <p style={{ fontSize: '0.85rem', color: '#c5cddb', lineHeight: 1.6, marginBottom: '0.65rem', whiteSpace: 'pre-line' }}>
                            {email.body || email.preview}
                          </p>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button type="button"
                              onClick={() => askEllinea(`Subject: ${email.subject}\nFrom: ${email.from}\n${email.body || email.preview}`, `Summarize this email and suggest what action to take: "${email.subject}"`)}
                              style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 6, color: '#c4b5fd', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                              âœ¦ Ask Ellinea
                            </button>
                            <Link href="/app/ellinea" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'var(--c-muted)', padding: '0.25rem 0.6rem', fontSize: '0.78rem', textDecoration: 'none' }}>
                              Open Ask workspace â†’
                            </Link>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* â”€â”€ REPORTS TAB (S7.5 â€” HTML download + print) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'reports' && (
        <section>
          <div className={styles.panelLabel} style={{ marginBottom: '0.35rem' }}>Reports &amp; Exports â€” from connected systems + EIP scheduled reports</div>
          <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginBottom: '0.65rem' }}>
            Reports pulled from synced Systems of Record and EIP scheduled report runs.
            Download as styled HTML (opens in browser, printable as PDF) or plain text.
          </p>
          {!loading && !data?.reports.length ? (
            <div className={styles.emptyCallout}>
              <div><strong>No reports yet</strong>
                <p>Run a scheduled report from <Link href="/app/reports" style={{ color: 'var(--c-blue)' }}>Scheduled Reports</Link>, or sync a connector that surfaces report objects.</p>
              </div>
              <Link href="/app/reports" className={styles.ghostBtn}>Go to Reports</Link>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Search reportsâ€¦"
                  style={{ flex: 1, minWidth: 180, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }} />
                <button type="button" className={styles.aiBtn} disabled={aiBusy}
                  onClick={() => askEllinea(reports.slice(0,6).map(r=>`â€¢ ${r.title} (${r.source}, ${r.generatedAt.slice(0,10)})`).join('\n'), 'Summarize key insights from these reports and flag anything important.')}>
                  {aiBusy ? 'Thinkingâ€¦' : 'âœ¦ Ellinea Summary'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {reports.map((report) => (
                  <article key={report.id} className={styles.card} style={{ padding: '0.8rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div aria-hidden style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: 'rgba(37,99,235,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>ðŸ“„</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>
                          {report.source} Â· {new Date(report.generatedAt).toLocaleString()}{report.sizeKb ? ` Â· ${report.sizeKb} KB` : ''}
                        </div>
                        {report.content && (
                          <div style={{ fontSize: '0.78rem', color: '#c5cddb', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.content}</div>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
                        <button type="button" onClick={() => downloadReportHtml(report)}
                          style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.35)', borderRadius: 6, color: '#93c5fd', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                          â†“ HTML (printable)
                        </button>
                        <button type="button" onClick={() => printReport(report)}
                          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'var(--c-muted)', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.72rem' }}>
                          ðŸ–¨ Print / PDF
                        </button>
                        <button type="button" onClick={() => downloadReportText(report)}
                          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--c-muted)', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.72rem' }}>
                          â†“ .txt
                        </button>
                        <button type="button" onClick={() => void copyText(report.content || report.title, report.id)}
                          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--c-muted)', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.72rem' }}>
                          {copiedKey === report.id ? 'âœ“ Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          <div className={styles.emptyCallout} style={{ marginTop: '1rem', background: 'rgba(37,99,235,0.07)', borderColor: 'rgba(37,99,235,0.25)' }}>
            <div><strong>EIP Scheduled Reports</strong><p>EIP can generate its own intelligence reports from your enterprise snapshot â€” schedules, run history, and email delivery are in Scheduled Reports.</p></div>
            <Link href="/app/reports" className={styles.ghostBtn}>Scheduled Reports â†’</Link>
          </div>
        </section>
      )}

      {/* â”€â”€ CONNECTORS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'connectors' && (
        <section>
          <div className={styles.panelLabel} style={{ marginBottom: '0.5rem' }}>Connected Systems â€” data sources feeding this window</div>
          {!loading && !data?.connectors.length ? (
            <div className={styles.emptyCallout}>
              <div><strong>No connectors installed</strong><p>Owner / IT Admin installs connectors to pull data from ERP, CRM, email, and other systems.</p></div>
              {orgAdmin && <Link href="/app/connectors" className={styles.aiBtn}>Install Connector</Link>}
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
                        {c.type} Â· {c.status}{c.lastSyncedAt ? ` Â· Last sync: ${new Date(c.lastSyncedAt).toLocaleString()}` : ' Â· Never synced'}
                      </div>
                    </div>
                    {orgAdmin && <Link href="/app/connectors" style={{ fontSize: '0.78rem', color: 'var(--c-blue)', textDecoration: 'none' }}>Manage â†’</Link>}
                  </div>
                );
              })}
            </div>
          )}
          <div className={styles.emptyCallout} style={{ marginTop: '1rem', background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}>
            <div><strong>EIP observes â€” it never writes back</strong><p>The Organization Data Window surfaces read-only data from your Systems of Record. ERP, CRM, HIS, and email systems remain unchanged.</p></div>
            <Link href="/app/org-system" className={styles.ghostBtn}>Organization System â†’</Link>
          </div>
        </section>
      )}

      {/* Bottom tip */}
      <div className={styles.emptyCallout} style={{ marginTop: '1.5rem', background: 'rgba(124,58,237,0.07)', borderColor: 'rgba(124,58,237,0.25)' }}>
        <div>
          <strong>Ask Ellinea about your organization data</strong>
          <p>"Summarize important emails this week" Â· "What reports need attention?" Â· "Which connectors are behind?" Â· "Flag any urgent items."</p>
        </div>
        <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea â†’</Link>
      </div>
    </div>
  );
}
