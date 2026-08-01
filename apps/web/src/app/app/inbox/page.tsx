'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  askEllineaApi,
  fetchEllineaMemory,
  fetchEnterpriseSummary,
  getSession,
  listInstallations,
  type ConnectorInstallationDto,
  type EnterpriseSummaryDto,
  type EllineaMemoryNoteDto,
} from '@/lib/api';
import styles from '../command.module.css';

type EmailThread = {
  id: string;
  subject: string;
  from: string;
  preview: string;
  at: string;
  unread: boolean;
  priority: 'high' | 'normal' | 'low';
  source: string; // connector displayName
};

type SummaryState = { busy: boolean; text: string; error: string };

/** Extract email-like threads from UEM timeline objects */
function buildEmailThreads(
  summary: EnterpriseSummaryDto | null,
  installs: ConnectorInstallationDto[],
): EmailThread[] {
  if (!summary || summary.status !== 'synced') return [];
  const emailInstall = installs.find(
    (i) =>
      i.catalogId?.toLowerCase().includes('email') ||
      i.displayName?.toLowerCase().includes('email') ||
      i.catalogId?.toLowerCase().includes('imap'),
  );
  if (!emailInstall) return [];

  // Build threads from UEM document objects + timeline events that look like emails
  const threads: EmailThread[] = [];
  const EMAIL_HINT = /\b(email|mail|inbox|message|subject|from|re:|fwd:)\b/i;

  for (const obj of summary.model?.objects ?? []) {
    if (obj.kind !== 'document' && !EMAIL_HINT.test(obj.name)) continue;
    threads.push({
      id: obj.id,
      subject: obj.name,
      from: obj.status?.includes('@') ? obj.status : emailInstall.config.imapUser || emailInstall.displayName,
      preview: obj.status || 'No preview available',
      at: summary.syncedAt || new Date().toISOString(),
      unread: (obj.status || '').toLowerCase().includes('unread') || (obj.status || '').toLowerCase().includes('new'),
      priority: (obj.status || '').toLowerCase().includes('urgent') || (obj.status || '').toLowerCase().includes('critical') ? 'high' : 'normal',
      source: emailInstall.displayName,
    });
  }

  // Fill from timeline if no document objects yet
  if (!threads.length) {
    for (const ev of (summary.timeline || []).slice(0, 10)) {
      if (!EMAIL_HINT.test(`${ev.title} ${ev.detail}`)) continue;
      threads.push({
        id: `tl-${ev.title}`,
        subject: ev.title,
        from: emailInstall.config.imapUser || emailInstall.displayName,
        preview: ev.detail,
        at: summary.syncedAt || new Date().toISOString(),
        unread: ev.title.toLowerCase().includes('new') || ev.title.toLowerCase().includes('unread'),
        priority: 'normal',
        source: emailInstall.displayName,
      });
    }
  }

  return threads.slice(0, 30);
}

function priorityBadge(priority: EmailThread['priority']) {
  if (priority === 'high')
    return (
      <span style={{ padding: '0.1rem 0.4rem', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
        Urgent
      </span>
    );
  return null;
}

export default function InboxCompanionPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [installs, setInstalls] = useState<ConnectorInstallationDto[]>([]);
  const [memory, setMemory] = useState<EllineaMemoryNoteDto[]>([]);
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [aiSummary, setAiSummary] = useState<SummaryState>({ busy: false, text: '', error: '' });

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setOrgAdmin(isOrgAdminRole(s.user.role));
    setRole(s.user.role);

    Promise.all([
      fetchEnterpriseSummary().catch(() => null),
      listInstallations().catch(() => [] as ConnectorInstallationDto[]),
      fetchEllineaMemory().catch(() => [] as EllineaMemoryNoteDto[]),
    ])
      .then(([snap, list, mem]) => {
        setSummary(snap);
        setInstalls(list);
        setMemory(mem);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load inbox'))
      .finally(() => setLoading(false));
  }, []);

  const emailInstalls = useMemo(
    () =>
      installs.filter(
        (i) =>
          i.catalogId?.toLowerCase().includes('email') ||
          i.catalogId?.toLowerCase().includes('imap') ||
          i.displayName?.toLowerCase().includes('email') ||
          i.displayName?.toLowerCase().includes('mail'),
      ),
    [installs],
  );

  const threads = useMemo(
    () => buildEmailThreads(summary, installs),
    [summary, installs],
  );

  const synced = summary?.status === 'synced';
  const needle = query.trim().toLowerCase();
  const filtered = threads.filter((t) => {
    if (!needle) return true;
    return `${t.subject} ${t.from} ${t.preview}`.toLowerCase().includes(needle);
  });

  const unreadCount = threads.filter((t) => t.unread).length;
  const highPriorityCount = threads.filter((t) => t.priority === 'high').length;

  async function summarizeWithEllinea() {
    if (!summary) return;
    setAiSummary({ busy: true, text: '', error: '' });
    try {
      const threadContext = threads.length
        ? threads.slice(0, 8).map((t) => `• ${t.subject} (from: ${t.from}): ${t.preview}`).join('\n')
        : 'No email threads available yet.';
      const question = `Summarize the most important work emails and inbox activity. Context:\n${threadContext}`;
      const res = await askEllineaApi({
        question,
        summary,
        memory,
        templateAnswer: threads.length
          ? `Inbox summary: ${threads.length} emails from ${emailInstalls.length} connector(s). ${highPriorityCount > 0 ? `${highPriorityCount} urgent. ` : ''}Most recent: ${threads[0]?.subject || 'n/a'}.`
          : 'No emails in current snapshot. Connect and sync an email connector to get inbox intelligence.',
        role,
      });
      setAiSummary({ busy: false, text: res.answer, error: '' });
    } catch (err) {
      setAiSummary({ busy: false, text: '', error: err instanceof Error ? err.message : 'AI summary failed' });
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mobile Work Companion · Inbox</p>
          <h1>Work email</h1>
          <p className={styles.lede}>
            Ellinea surfaces highlights from the work email connector. EIP wraps the inbox — it
            does not become your mail server.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.aiBtn} onClick={summarizeWithEllinea} disabled={aiSummary.busy}>
            {aiSummary.busy ? 'Summarizing…' : '✦ Ellinea Summary'}
          </button>
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.ghostBtn}>Connectors</Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className={styles.emptyCallout} role="alert">
          <div><strong>Error</strong><p>{error}</p></div>
        </div>
      ) : null}

      {/* Ellinea AI Summary */}
      {(aiSummary.text || aiSummary.error) ? (
        <section className={styles.aiCard} style={{ marginBottom: '1rem' }}>
          <span className={styles.aiBadge}>Ellinea AI · Inbox Brief</span>
          {aiSummary.error ? (
            <p style={{ color: '#fca5a5', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{aiSummary.error}</p>
          ) : (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{aiSummary.text}</p>
          )}
        </section>
      ) : null}

      {/* KPIs */}
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>Email connectors</span>
          <strong>{emailInstalls.length}</strong>
          <em>{emailInstalls.length ? emailInstalls.map((e) => e.displayName).join(', ').slice(0, 30) : 'None installed'}</em>
        </div>
        <div className={styles.kpi}>
          <span>Threads in model</span>
          <strong>{loading ? '—' : threads.length}</strong>
          <em>From last connector sync</em>
        </div>
        <div className={styles.kpi}>
          <span>Unread</span>
          <strong className={unreadCount > 0 ? styles.warn : undefined}>{loading ? '—' : unreadCount}</strong>
          <em>Flagged as unread</em>
        </div>
        <div className={styles.kpi}>
          <span>Urgent</span>
          <strong className={highPriorityCount > 0 ? styles.warn : undefined}>{loading ? '—' : highPriorityCount}</strong>
          <em>High-priority messages</em>
        </div>
      </div>

      {/* Not connected */}
      {!loading && !emailInstalls.length ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>No email connector installed</strong>
            <p>
              Owner / IT installs the Email (IMAP) connector under Connectors. Once synced,
              Ellinea surfaces inbox highlights here.
            </p>
          </div>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.aiBtn}>Install Email Connector</Link>
          ) : (
            <Link href="/app/ellinea" className={styles.aiBtn}>Ask Ellinea</Link>
          )}
        </div>
      ) : null}

      {/* Connected but not synced */}
      {!loading && emailInstalls.length > 0 && !synced ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>{emailInstalls.length} email connector{emailInstalls.length > 1 ? 's' : ''} installed</strong>
            <p>Run a sync to populate inbox threads. Status: {emailInstalls.map((e) => `${e.displayName} (${e.status})`).join(', ')}.</p>
          </div>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.ghostBtn}>Run Sync</Link>
          ) : null}
        </div>
      ) : null}

      {/* Synced — show threads */}
      {!loading && emailInstalls.length > 0 && synced ? (
        <>
          {/* Search */}
          <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0 0.75rem' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emails…"
              aria-label="Search emails"
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                color: 'inherit',
                padding: '0.4rem 0.7rem',
                fontSize: '0.85rem',
              }}
            />
            <span style={{ color: 'var(--c-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>
              {filtered.length} {filtered.length !== threads.length ? `of ${threads.length}` : ''}
            </span>
          </div>

          {threads.length === 0 ? (
            <div className={styles.emptyCallout}>
              <div>
                <strong>No email objects in current snapshot</strong>
                <p>
                  The connector synced but no email-type objects were found in the UEM model. Try
                  asking Ellinea about your inbox for template-based insights.
                </p>
              </div>
              <button type="button" className={styles.ghostBtn} onClick={summarizeWithEllinea}>Ask Ellinea</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyCallout}>
              <div><strong>No emails match "{query}"</strong><p>Clear the search to see all threads.</p></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {filtered.map((thread) => (
                <article
                  key={thread.id}
                  className={styles.card}
                  style={{
                    padding: '0.8rem 1rem',
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    borderLeft: thread.unread ? '3px solid rgba(124,58,237,0.7)' : '3px solid transparent',
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: thread.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(124,58,237,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    {thread.priority === 'high' ? '🔴' : '✉️'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: thread.unread ? 800 : 600, fontSize: '0.88rem', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {thread.subject}
                      </span>
                      {thread.unread ? (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} aria-label="unread" />
                      ) : null}
                      {priorityBadge(thread.priority)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginBottom: '0.2rem' }}>
                      From: {thread.from} · {new Date(thread.at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#c5cddb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {thread.preview}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
                      via {thread.source}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const q = `Summarize this email: Subject: ${thread.subject}. From: ${thread.from}. Preview: ${thread.preview}`;
                        window.location.href = `/app/ellinea`;
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('ellinea-prefill', { detail: { question: q } }));
                        }, 500);
                      }}
                      style={{
                        background: 'rgba(124,58,237,0.2)',
                        border: '1px solid rgba(124,58,237,0.35)',
                        borderRadius: 6,
                        color: '#c4b5fd',
                        padding: '0.2rem 0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ✦ Ask
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* Ask Ellinea tip */}
      <div className={styles.emptyCallout} style={{ marginTop: '1rem', background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.3)' }}>
        <div>
          <strong>Ellinea can summarize your inbox</strong>
          <p>Ask: "Summarize important work emails" · "Which emails need my attention?" · "Urgent messages this week?"</p>
        </div>
        <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
      </div>
    </div>
  );
}
