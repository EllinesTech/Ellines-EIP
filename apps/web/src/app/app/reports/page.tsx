'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import {
  buildReportPreview,
  parseEmailList,
  readScheduledReports,
  writeScheduledReports,
  REPORT_TEMPLATES,
  type ReportCadence,
  type ReportTemplate,
  type ScheduledReport,
} from '@/lib/scheduled-reports';
import {
  fetchEnterpriseSummary,
  getSession,
  listReportsApi,
  createReportApi,
  runReportFullApi,
  toggleReportApi,
  deleteReportApi,
  updateReportDeliveryApi,
  type ScheduledReportDto,
} from '@/lib/api';

type ReportRun = {
  id: string;
  reportId: string;
  reportTitle: string;
  reportTemplate: string;
  runAt: string;
  status: 'queued' | 'sent' | 'failed';
  emailStatus: string;
  recipientCount: number;
  reportChars: number;
  reportBody?: string;
};
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

function fromDto(dto: ScheduledReportDto): ScheduledReport {
  return {
    id: dto.id,
    title: dto.title,
    cadence: dto.cadence as ReportCadence,
    template: (dto.template as ReportTemplate) || 'custom',
    enabled: dto.enabled,
    lastRunAt: dto.lastRunAt,
    nextRunHint: dto.nextRunHint,
    createdAt: dto.createdAt,
    recipients: Array.isArray(dto.recipients) ? dto.recipients : [],
    cc: Array.isArray(dto.cc) ? dto.cc : [],
    bcc: Array.isArray(dto.bcc) ? dto.bcc : [],
    sendHour: typeof dto.sendHour === 'number' ? dto.sendHour : null,
  };
}

function formatRecipients(list: string[]): string {
  if (!list.length) return 'You (actor)';
  if (list.length <= 2) return list.join(', ');
  return `${list[0]}, ${list[1]} +${list.length - 2}`;
}

export default function ReportsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [items, setItems] = useState<ScheduledReport[]>([]);
  const [template, setTemplate] = useState<ReportTemplate>('executive');
  const [title, setTitle] = useState('CEO Daily Brief');
  const [cadence, setCadence] = useState<ReportCadence>('daily');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [ccRaw, setCcRaw] = useState('');
  const [bccRaw, setBccRaw] = useState('');
  const [sendHour, setSendHour] = useState<string>('');
  const [preview, setPreview] = useState('');
  const [serverSync, setServerSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runNotice, setRunNotice] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editRecipients, setEditRecipients] = useState('');
  const [editCc, setEditCc] = useState('');
  const [editBcc, setEditBcc] = useState('');
  const [editSendHour, setEditSendHour] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ReportRun[]>([]);
  const [historyFilter, setHistoryFilter] = useState<string>('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedRun, setSelectedRun] = useState<ReportRun | null>(null);
  const [runContent, setRunContent] = useState<string>('');
  const [resendRecipients, setResendRecipients] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    if (!isOrgAdminRole(s.user.role)) { router.replace('/app'); return; }
    setAllowed(true);
    setOrgId(s.organization.id);
    setOrgName(s.organization.name);

    // Load reports — server first, localStorage fallback
    listReportsApi()
      .then((dtos) => {
        const serverItems = dtos.map(fromDto);
        setItems(serverItems);
        setServerSync(true);
        writeScheduledReports(s.organization.id, serverItems);
      })
      .catch(() => {
        setItems(readScheduledReports(s.organization.id));
      });

    // Build preview from live snapshot
    fetchEnterpriseSummary()
      .then((summary) => {
        setPreview(buildReportPreview({
          orgName: s.organization.name,
          healthScore: summary.status === 'synced' ? summary.healthScore : 0,
          openAlerts: summary.openAlerts || 0,
          openDecisions: summary.openDecisions || 0,
          connectedSystems: summary.connectedSystems || 0,
          briefHighlight: summary.status === 'synced'
            ? summary.briefHighlight
            : 'No live snapshot yet — sync connectors first.',
          template,
        }));
      })
      .catch(() => {
        setPreview(buildReportPreview({
          orgName: s.organization.name,
          healthScore: 0, openAlerts: 0, openDecisions: 0, connectedSystems: 0,
          briefHighlight: 'Snapshot unavailable.',
          template,
        }));
      });
  }, [router, template]);

  function localPersist(next: ScheduledReport[]) {
    if (!orgId) return;
    setItems(next);
    if (!serverSync) writeScheduledReports(orgId, next);
  }

  function parsedSendHour(raw: string): number | null {
    if (raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 23) return null;
    return Math.trunc(n);
  }

  function resetForm() {
    setTemplate('executive');
    setTitle('CEO Daily Brief');
    setCadence('daily');
    setRecipientsRaw('');
    setCcRaw('');
    setBccRaw('');
    setSendHour('');
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);

    const recipients = parseEmailList(recipientsRaw);
    const cc = parseEmailList(ccRaw);
    const bcc = parseEmailList(bccRaw);
    const hour = parsedSendHour(sendHour);
    const hourHint = hour == null ? 'morning' : `${String(hour).padStart(2, '0')}:00 UTC`;

    if (serverSync) {
      createReportApi({
        title: title.trim(),
        cadence,
        template,
        recipients,
        cc,
        bcc,
        sendHour: hour,
      })
        .then((dto) => {
          setItems((prev) => [fromDto(dto), ...prev]);
          resetForm();
        })
        .catch(() => {
          const next: ScheduledReport = {
            id: `rpt_${Date.now()}`,
            title: title.trim(),
            cadence,
            template,
            enabled: true,
            lastRunAt: null,
            nextRunHint:
              cadence === 'daily'
                ? `Tomorrow · ${hourHint}`
                : `Next Monday · ${hourHint}`,
            createdAt: new Date().toISOString(),
            recipients,
            cc,
            bcc,
            sendHour: hour,
          };
          localPersist([next, ...items]);
          resetForm();
        })
        .finally(() => setBusy(false));
      return;
    }

    const next: ScheduledReport = {
      id: `rpt_${Date.now()}`,
      title: title.trim(),
      cadence,
      template,
      enabled: true,
      lastRunAt: null,
      nextRunHint:
        cadence === 'daily'
          ? `Tomorrow · ${hourHint} (local stub)`
          : `Next Monday · ${hourHint} (local stub)`,
      createdAt: new Date().toISOString(),
      recipients,
      cc,
      bcc,
      sendHour: hour,
    };
    localPersist([next, ...items]);
    resetForm();
    setBusy(false);
  }

  function runNow(id: string) {
    if (busy) return;
    setBusy(true);

    if (serverSync) {
      runReportFullApi(id)
        .then((dto) => {
          setItems((prev) => prev.map((r) => (r.id === id ? fromDto(dto) : r)));
          const emailStatus = dto.emailStatus || dto.lastEmailStatus || '';
          const chars = dto.reportChars ? ` (${dto.reportChars} chars)` : '';
          const toCount = dto.deliveredTo?.length ?? dto.recipients?.length ?? 0;
          const ccCount = dto.deliveredCc?.length ?? dto.cc?.length ?? 0;
          const bccCount = dto.deliveredBccCount ?? dto.bcc?.length ?? 0;
          const dest =
            toCount || ccCount || bccCount
              ? ` → ${toCount} to` +
                (ccCount ? ` · ${ccCount} cc` : '') +
                (bccCount ? ` · ${bccCount} bcc` : '')
              : '';
          const msg = emailStatus.startsWith('delivered')
            ? `✓ Report sent${dest}${chars}`
            : emailStatus === 'not_configured'
              ? `Report generated${chars} — no email configured (set RESEND_API_KEY on Pages)`
              : emailStatus.startsWith('failed')
                ? `Report generated${chars} — email failed: ${emailStatus.replace('failed: ', '')}`
                : `Report run${chars}`;
          setRunNotice((prev) => ({ ...prev, [id]: msg }));
          setTimeout(() => setRunNotice((prev) => { const n = { ...prev }; delete n[id]; return n; }), 8000);
        })
        .catch(() => {
          const now = new Date().toISOString();
          localPersist(items.map((r) =>
            r.id === id ? { ...r, lastRunAt: now, nextRunHint: r.cadence === 'daily' ? 'Tomorrow morning' : 'Next Monday' } : r,
          ));
        })
        .finally(() => setBusy(false));
      return;
    }

    const now = new Date().toISOString();
    localPersist(items.map((r) =>
      r.id === id ? { ...r, lastRunAt: now, nextRunHint: r.cadence === 'daily' ? 'Tomorrow morning (local stub)' : 'Next Monday (local stub)' } : r,
    ));
    setBusy(false);
  }

  function toggle(id: string) {
    const report = items.find((r) => r.id === id);
    if (!report || busy) return;
    const nextEnabled = !report.enabled;

    if (serverSync) {
      setBusy(true);
      toggleReportApi(id, nextEnabled)
        .then((dto) => setItems((prev) => prev.map((r) => (r.id === id ? fromDto(dto) : r))))
        .catch(() => localPersist(items.map((r) => (r.id === id ? { ...r, enabled: nextEnabled } : r))))
        .finally(() => setBusy(false));
      return;
    }
    localPersist(items.map((r) => (r.id === id ? { ...r, enabled: nextEnabled } : r)));
  }

  function remove(id: string) {
    if (busy) return;
    if (serverSync) {
      setBusy(true);
      deleteReportApi(id)
        .then(() => setItems((prev) => prev.filter((r) => r.id !== id)))
        .catch(() => localPersist(items.filter((r) => r.id !== id)))
        .finally(() => setBusy(false));
      return;
    }
    localPersist(items.filter((r) => r.id !== id));
  }

  function startEdit(r: ScheduledReport) {
    setEditId(r.id);
    setEditRecipients(r.recipients.join(', '));
    setEditCc(r.cc.join(', '));
    setEditBcc(r.bcc.join(', '));
    setEditSendHour(r.sendHour == null ? '' : String(r.sendHour));
  }

  function saveEdit(id: string) {
    if (busy) return;
    const recipients = parseEmailList(editRecipients);
    const cc = parseEmailList(editCc);
    const bcc = parseEmailList(editBcc);
    const hour = parsedSendHour(editSendHour);
    const hourHint = hour == null ? 'morning' : `${String(hour).padStart(2, '0')}:00 UTC`;

    if (serverSync) {
      setBusy(true);
      updateReportDeliveryApi(id, { recipients, cc, bcc, sendHour: hour })
        .then((dto) => {
          setItems((prev) => prev.map((r) => (r.id === id ? fromDto(dto) : r)));
          setEditId(null);
        })
        .catch(() => {
          localPersist(items.map((r) =>
            r.id === id
              ? {
                  ...r,
                  recipients,
                  cc,
                  bcc,
                  sendHour: hour,
                  nextRunHint:
                    r.cadence === 'daily'
                      ? `Tomorrow · ${hourHint}`
                      : `Next Monday · ${hourHint}`,
                }
              : r,
          ));
          setEditId(null);
        })
        .finally(() => setBusy(false));
      return;
    }

    localPersist(items.map((r) =>
      r.id === id
        ? {
            ...r,
            recipients,
            cc,
            bcc,
            sendHour: hour,
            nextRunHint:
              r.cadence === 'daily'
                ? `Tomorrow · ${hourHint}`
                : `Next Monday · ${hourHint}`,
          }
        : r,
    ));
    setEditId(null);
  }

  async function loadHistory(reportId?: string) {
    setLoadingHistory(true);
    try {
      const token = getSession()?.accessToken;
      if (!token) return;

      const url = reportId
        ? `/api/v1/orgs/me/reports/history?reportId=${reportId}&limit=50`
        : '/api/v1/orgs/me/reports/history?limit=50';

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = (await res.json()) as ReportRun[];
        setHistory(data);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoadingHistory(false);
    }
  }

  async function viewRunContent(run: ReportRun) {
    try {
      const token = getSession()?.accessToken;
      if (!token) return;

      const res = await fetch(`/api/v1/orgs/me/reports/history/${run.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = (await res.json()) as { content: string; format: string };
        setRunContent(data.content);
        setSelectedRun(run);
      }
    } catch {
      // Ignore errors
    }
  }

  async function resendReport(runId: string) {
    if (busy) return;
    setBusy(true);

    try {
      const token = getSession()?.accessToken;
      if (!token) return;

      const recipients = parseEmailList(resendRecipients);
      const res = await fetch(`/api/v1/orgs/me/reports/history/${runId}/resend`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipients: recipients.length ? recipients : undefined }),
      });

      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; sentCount: number; emailStatus: string };
        alert(
          data.ok
            ? `✓ Report resent to ${data.sentCount} recipient${data.sentCount !== 1 ? 's' : ''}`
            : `Failed to resend report: ${data.emailStatus}`,
        );
        setResendRecipients('');
        setSelectedRun(null);
      } else {
        alert('Failed to resend report');
      }
    } catch {
      alert('Failed to resend report');
    } finally {
      setBusy(false);
    }
  }

  async function downloadRunContent(runId: string, title: string) {
    try {
      const token = getSession()?.accessToken;
      if (!token) return;

      const res = await fetch(`/api/v1/orgs/me/reports/history/${runId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = (await res.json()) as { content: string };
        const blob = new Blob([data.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      alert('Failed to download report');
    }
  }

  if (!allowed) return <div className={styles.page}><p className={styles.lede}>Checking access…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workflow</p>
          <h1>Scheduled reports</h1>
          <p className={styles.lede}>
            Daily/weekly packs for {orgName} — multi-recipient To / Cc / Bcc with send-hour scheduling.
            {serverSync ? ' Server-persisted.' : ' Local until Supabase is connected.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => {
              if (!showHistory) loadHistory();
              setShowHistory(!showHistory);
            }}
          >
            {showHistory ? 'Back to Schedules' : '📜 History'}
          </button>
          <Link href="/app/rules" className={styles.ghostBtn}>Rules</Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
        </div>
      </header>

      {!showHistory && (
        <section className={styles.brief}>
          <div className={styles.panelLabel}>Schedule</div>
        <form className={adminStyles.form} onSubmit={onAdd}>
          <label>
            Template
            <select
              value={template}
              onChange={(e) => {
                const newTemplate = e.target.value as ReportTemplate;
                setTemplate(newTemplate);
                const templateMeta = REPORT_TEMPLATES.find((t) => t.value === newTemplate);
                if (templateMeta) setTitle(templateMeta.defaultTitle);
              }}
            >
              {REPORT_TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
          </label>
          <label>
            Cadence
            <select value={cadence} onChange={(e) => setCadence(e.target.value as ReportCadence)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label>
            Send hour (UTC)
            <select value={sendHour} onChange={(e) => setSendHour(e.target.value)}>
              <option value="">Morning (default)</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={String(h)}>
                  {String(h).padStart(2, '0')}:00 UTC
                </option>
              ))}
            </select>
          </label>
          <label>
            To (recipients)
            <input
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder="ceo@acme.com, board@acme.com"
              autoComplete="off"
            />
          </label>
          <label>
            Cc
            <input
              value={ccRaw}
              onChange={(e) => setCcRaw(e.target.value)}
              placeholder="ops@acme.com"
              autoComplete="off"
            />
          </label>
          <label>
            Bcc
            <input
              value={bccRaw}
              onChange={(e) => setBccRaw(e.target.value)}
              placeholder="archive@acme.com"
              autoComplete="off"
            />
          </label>
          <p className={styles.lede} style={{ margin: 0, fontSize: '0.85rem' }}>
            Leave To empty to deliver to your signed-in email. Separate addresses with commas.
          </p>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            Add schedule
          </button>
        </form>
      </section>
      )}

      {!showHistory && (
        <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Schedules · {items.length}</div>
        {!items.length ? (
          <p className={styles.lede}>No schedules yet.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Template</th>
                <th>Title</th>
                <th>Cadence</th>
                <th>Delivery</th>
                <th>Next</th>
                <th>Last run</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const templateMeta = REPORT_TEMPLATES.find((t) => t.value === r.template);
                return (
                  <tr key={r.id}>
                    <td>{templateMeta?.label || '✏️ Custom'}</td>
                    <td>{r.title}</td>
                    <td>{r.cadence}</td>
                    <td>
                      {editId === r.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '14rem' }}>
                          <input
                            value={editRecipients}
                            onChange={(e) => setEditRecipients(e.target.value)}
                            placeholder="To"
                            aria-label="To recipients"
                          />
                          <input
                            value={editCc}
                            onChange={(e) => setEditCc(e.target.value)}
                            placeholder="Cc"
                            aria-label="Cc"
                          />
                          <input
                            value={editBcc}
                            onChange={(e) => setEditBcc(e.target.value)}
                            placeholder="Bcc"
                            aria-label="Bcc"
                          />
                          <select
                            value={editSendHour}
                            onChange={(e) => setEditSendHour(e.target.value)}
                            aria-label="Send hour UTC"
                          >
                            <option value="">Morning (default)</option>
                            {Array.from({ length: 24 }, (_, h) => (
                              <option key={h} value={String(h)}>
                                {String(h).padStart(2, '0')}:00 UTC
                              </option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className={adminStyles.primary}
                              disabled={busy}
                              onClick={() => saveEdit(r.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={adminStyles.ghost}
                              disabled={busy}
                              onClick={() => setEditId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.8rem', lineHeight: 1.35 }}>
                          <div><strong>To</strong> {formatRecipients(r.recipients)}</div>
                          {r.cc.length ? <div><strong>Cc</strong> {formatRecipients(r.cc)}</div> : null}
                          {r.bcc.length ? <div><strong>Bcc</strong> {r.bcc.length} hidden</div> : null}
                          <div>
                            <strong>Hour</strong>{' '}
                            {r.sendHour == null ? 'morning' : `${String(r.sendHour).padStart(2, '0')}:00 UTC`}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>{r.enabled ? r.nextRunHint : 'Paused'}</td>
                    <td>{r.lastRunAt ? new Date(r.lastRunAt).toLocaleString() : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          type="button" className={adminStyles.primary}
                          onClick={() => runNow(r.id)} disabled={!r.enabled || busy}
                        >Run now</button>
                        <button
                          type="button" className={adminStyles.ghost}
                          onClick={() => {
                            const token = getSession()?.accessToken;
                            if (!token) return;
                            window.open(`/api/v1/orgs/me/reports/${r.id}/pdf`, '_blank');
                          }}
                          disabled={busy}
                        >📥 PDF</button>
                        <button
                          type="button"
                          className={adminStyles.ghost}
                          disabled={busy || editId === r.id}
                          onClick={() => startEdit(r)}
                        >
                          Recipients
                        </button>
                        <button type="button" className={adminStyles.ghost} disabled={busy} onClick={() => toggle(r.id)}>
                          {r.enabled ? 'Pause' : 'Resume'}
                        </button>
                        <button type="button" className={adminStyles.ghost} disabled={busy} onClick={() => remove(r.id)}>
                          Remove
                        </button>
                        {runNotice[r.id] ? (
                          <span style={{ fontSize: '0.75rem', color: runNotice[r.id].startsWith('✓') ? '#6ee7b7' : '#94a3b8', whiteSpace: 'nowrap' }}>
                            {runNotice[r.id]}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      )}

      {!showHistory && (
        <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
          <div className={styles.panelLabel}>Preview</div>
          <pre className={adminStyles.actionCode} style={{ whiteSpace: 'pre-wrap', marginTop: '0.45rem' }}>
            {preview || 'Loading…'}
          </pre>
        </section>
      )}

      {showHistory && (
        <section className={adminStyles.tableWrap} style={{ marginTop: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className={styles.panelLabel}>Report History · {history.length}</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={historyFilter}
                onChange={(e) => {
                  setHistoryFilter(e.target.value);
                  loadHistory(e.target.value || undefined);
                }}
                className={adminStyles.ghost}
                disabled={loadingHistory}
              >
                <option value="">All reports</option>
                {items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={adminStyles.ghost}
                onClick={() => loadHistory(historyFilter || undefined)}
                disabled={loadingHistory}
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {loadingHistory ? (
            <p className={styles.lede}>Loading history…</p>
          ) : !history.length ? (
            <p className={styles.lede}>No report runs yet. Schedule a report and click "Run now" to see history.</p>
          ) : (
            <table className={adminStyles.table}>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Template</th>
                  <th>Run at</th>
                  <th>Status</th>
                  <th>Recipients</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((run) => (
                  <tr key={run.id}>
                    <td>{run.reportTitle}</td>
                    <td>{REPORT_TEMPLATES.find((t) => t.value === run.reportTemplate)?.label || run.reportTemplate}</td>
                    <td>{new Date(run.runAt).toLocaleString()}</td>
                    <td>
                      <span
                        style={{
                          color:
                            run.status === 'sent'
                              ? '#6ee7b7'
                              : run.status === 'failed'
                                ? '#fca5a5'
                                : '#94a3b8',
                        }}
                      >
                        {run.status === 'sent' ? '✓ Sent' : run.status === 'failed' ? '✗ Failed' : '⏳ Queued'}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {run.emailStatus}
                      </div>
                    </td>
                    <td>{run.recipientCount || 1}</td>
                    <td>{run.reportChars ? `${(run.reportChars / 1024).toFixed(1)} KB` : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={adminStyles.ghost}
                          onClick={() => viewRunContent(run)}
                          disabled={busy}
                        >
                          👁 View
                        </button>
                        <button
                          type="button"
                          className={adminStyles.ghost}
                          onClick={() => downloadRunContent(run.id, run.reportTitle)}
                          disabled={busy}
                        >
                          ↓ Download
                        </button>
                        <button
                          type="button"
                          className={adminStyles.ghost}
                          onClick={() => {
                            setSelectedRun(run);
                            setResendRecipients('');
                          }}
                          disabled={busy}
                        >
                          ✉ Resend
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {selectedRun && !runContent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSelectedRun(null)}
        >
          <div
            style={{
              background: '#1e293b',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              maxWidth: '500px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Resend Report</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              {selectedRun.reportTitle} · {new Date(selectedRun.runAt).toLocaleString()}
            </p>
            <label className={adminStyles.form} style={{ display: 'block', marginTop: '1rem' }}>
              Recipients (leave empty to send to yourself)
              <input
                value={resendRecipients}
                onChange={(e) => setResendRecipients(e.target.value)}
                placeholder="email1@example.com, email2@example.com"
                autoComplete="off"
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className={adminStyles.primary}
                onClick={() => resendReport(selectedRun.id)}
                disabled={busy}
              >
                Send
              </button>
              <button
                type="button"
                className={adminStyles.ghost}
                onClick={() => {
                  setSelectedRun(null);
                  setResendRecipients('');
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRun && runContent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem',
          }}
          onClick={() => {
            setSelectedRun(null);
            setRunContent('');
          }}
        >
          <div
            style={{
              background: '#1e293b',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ marginTop: 0 }}>{selectedRun.reportTitle}</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0.5rem 0 1rem' }}>
                  {new Date(selectedRun.runAt).toLocaleString()} · {selectedRun.reportChars ? `${(selectedRun.reportChars / 1024).toFixed(1)} KB` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRun(null);
                  setRunContent('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                }}
              >
                ×
              </button>
            </div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#0f172a',
                padding: '1rem',
                borderRadius: '0.375rem',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                maxHeight: '60vh',
                overflow: 'auto',
              }}
            >
              {runContent}
            </pre>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                type="button"
                className={adminStyles.primary}
                onClick={() => {
                  const blob = new Blob([runContent], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedRun.reportTitle.replace(/[^a-z0-9]/gi, '_')}_${new Date(selectedRun.runAt).toISOString().slice(0, 10)}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                ↓ Download
              </button>
              <button
                type="button"
                className={adminStyles.ghost}
                onClick={() => {
                  setRunContent('');
                }}
              >
                ✉ Resend
              </button>
              <button
                type="button"
                className={adminStyles.ghost}
                onClick={() => {
                  setSelectedRun(null);
                  setRunContent('');
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
