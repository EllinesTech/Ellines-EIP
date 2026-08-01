'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  APPROVAL_TEMPLATES,
  advanceApproval,
  canActOnCurrentStep,
  createApprovalRequest,
  readApprovals,
  seedApprovalsFromSummary,
  templateLabel,
  writeApprovals,
  type ApprovalRequest,
  type ApprovalTemplateId,
} from '@/lib/approvals';
import {
  fetchEnterpriseSummary,
  getSession,
  deliverNotification,
  listApprovals,
  createApprovalApi,
  decideApprovalApi,
  type ApprovalRequestDto,
} from '@/lib/api';
import { publishEnterpriseEvent } from '@/lib/event-bus';
import { readUiPrefs, type UiPrefs } from '@/lib/ui-prefs';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import localStyles from './approvals.module.css';

/** Bridge API DTO to local ApprovalRequest shape. */
function fromDto(dto: ApprovalRequestDto): ApprovalRequest {
  return {
    id: dto.id,
    title: dto.title,
    detail: dto.detail,
    requester: dto.requester,
    status: dto.status as ApprovalRequest['status'],
    createdAt: dto.createdAt,
    decidedAt: dto.decidedAt ?? undefined,
    decidedBy: dto.decidedBy ?? undefined,
    source: (dto.source as ApprovalRequest['source']) || 'manual',
    templateId: (dto.templateId as ApprovalTemplateId) || 'simple',
    currentStepIndex: dto.currentStepIndex,
    steps: dto.steps.map((s) => ({
      key: s.key as ApprovalRequest['steps'][0]['key'],
      label: s.label,
      status: s.status as ApprovalRequest['steps'][0]['status'],
      actorRole: s.actorRole,
      decidedBy: s.decidedBy ?? undefined,
      decidedAt: s.decidedAt ?? undefined,
    })),
  };
}

export default function ApprovalsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState('member');
  const [actorName, setActorName] = useState('');
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [prefs, setPrefs] = useState<UiPrefs | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [templateId, setTemplateId] = useState<ApprovalTemplateId>('it_then_owner');
  const [busy, setBusy] = useState(false);
  const [serverSync, setServerSync] = useState(false);
  const [detailItem, setDetailItem] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    const ui = readUiPrefs();
    setPrefs(ui);
    setOrgId(session.organization.id);
    setRole(session.user.role);
    setActorName(session.user.fullName);

    // Try server first, fall back to localStorage
    listApprovals()
      .then((dtos) => {
        const serverItems = dtos.map(fromDto);
        setItems(serverItems);
        setServerSync(true);
        // Sync server state into localStorage as cache
        writeApprovals(session.organization.id, serverItems);
      })
      .catch(() => {
        // Offline / no Supabase — use localStorage
        let list = readApprovals(session.organization.id);
        fetchEnterpriseSummary()
          .then((summary) => {
            if (ui.approvalsSeedFromDecisions) {
              list = seedApprovalsFromSummary(session.organization.id, summary, list);
              writeApprovals(session.organization.id, list);
            }
            setItems(list);
          })
          .catch(() => setItems(list));
      });
  }, []);

  function persist(next: ApprovalRequest[]) {
    if (!orgId) return;
    setItems(next);
    if (!serverSync) writeApprovals(orgId, next);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    if (serverSync) {
      setBusy(true);
      createApprovalApi({
        title: title.trim(),
        detail: detail.trim() || 'Manual approval request',
        templateId,
        source: 'manual',
      })
        .then((dto) => {
          const newItem = fromDto(dto);
          setItems((prev) => [newItem, ...prev]);
          publishEnterpriseEvent('approval.created', {
            approvalId: newItem.id,
            title: newItem.title,
            templateId: newItem.templateId,
          });
          setTitle('');
          setDetail('');
        })
        .catch(() => {
          // Fall back to local
          const newItem = createApprovalRequest({
            title: title.trim(),
            detail: detail.trim() || 'Manual approval request',
            requester: actorName || 'You',
            templateId,
            source: 'manual',
          });
          persist([newItem, ...items]);
          setTitle('');
          setDetail('');
        })
        .finally(() => setBusy(false));
      return;
    }

    const next = createApprovalRequest({
      title: title.trim(),
      detail: detail.trim() || 'Manual approval request',
      requester: actorName || 'You',
      templateId,
      source: 'manual',
    });
    persist([next, ...items]);
    publishEnterpriseEvent('approval.created', {
      approvalId: next.id,
      title: next.title,
      templateId: next.templateId,
    });
    setTitle('');
    setDetail('');
  }

  function decide(id: string, status: 'approved' | 'rejected') {
    setBusy(true);

    if (serverSync) {
      decideApprovalApi(id, { decision: status, actorName: actorName || role })
        .then((dto) => {
          const updated = fromDto(dto);
          setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
          publishEnterpriseEvent(`approval.${status}`, {
            approvalId: id,
            title: updated.title,
            overall: updated.status,
          });
          void deliverNotification({
            channel: 'email',
            subject: `Approval ${status}: ${updated.title}`,
            body: `${updated.title} is now ${updated.status}.`,
            eventType: `approval.${status}`,
          }).catch(() => undefined);
        })
        .catch(() => {
          // Fall back to local decision
          const next = items.map((item) =>
            item.id === id ? advanceApproval(item, status, actorName || role, role) : item,
          );
          persist(next);
        })
        .finally(() => setBusy(false));
      return;
    }

    const next = items.map((item) =>
      item.id === id ? advanceApproval(item, status, actorName || role, role) : item,
    );
    persist(next);
    const updated = next.find((i) => i.id === id);
    if (updated) {
      publishEnterpriseEvent(`approval.${status}`, {
        approvalId: id,
        title: updated.title,
        overall: updated.status,
      });
      void deliverNotification({
        channel: 'email',
        subject: `Approval ${status}: ${updated.title}`,
        body: `${updated.title} is now ${updated.status}.`,
        eventType: `approval.${status}`,
      }).catch(() => undefined);
    }
    setBusy(false);
  }

  const pending = items.filter((i) => i.status === 'pending');
  const decided = items.filter((i) => i.status !== 'pending');

  const STATUS_COLOR: Record<string, string> = {
    approved: '#10b981',
    rejected: '#ef4444',
    pending: '#f59e0b',
  };

  return (
    <div className={styles.page}>
      {/* Approval Detail Modal */}
      {detailItem ? (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDetailItem(null); }}
          role="dialog"
          aria-modal="true"
          aria-label={`Approval: ${detailItem.title}`}
        >
          <div style={{
            background: '#161b26', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)',
            maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Approval Request · {detailItem.templateId}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{detailItem.title}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{
                  padding: '0.25rem 0.65rem', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700,
                  background: `${STATUS_COLOR[detailItem.status] || '#64748b'}22`,
                  color: STATUS_COLOR[detailItem.status] || '#94a3b8',
                  border: `1px solid ${STATUS_COLOR[detailItem.status] || '#64748b'}44`,
                }}>
                  {detailItem.status}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  aria-label="Close"
                  style={{ background: 'transparent', border: 'none', color: 'var(--c-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem' }}
                >✕</button>
              </div>
            </div>

            {detailItem.detail ? (
              <p style={{ fontSize: '0.88rem', color: '#c5cddb', marginBottom: '1rem', padding: '0.65rem 0.85rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, borderLeft: '3px solid rgba(124,58,237,0.5)' }}>
                {detailItem.detail}
              </p>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
              <div><strong style={{ color: '#f4f7fb' }}>Requested by</strong><br />{detailItem.requester}</div>
              <div><strong style={{ color: '#f4f7fb' }}>Created</strong><br />{new Date(detailItem.createdAt).toLocaleString()}</div>
              {detailItem.decidedBy ? <div><strong style={{ color: '#f4f7fb' }}>Decided by</strong><br />{detailItem.decidedBy}</div> : null}
              {detailItem.decidedAt ? <div><strong style={{ color: '#f4f7fb' }}>Decided at</strong><br />{new Date(detailItem.decidedAt).toLocaleString()}</div> : null}
              <div><strong style={{ color: '#f4f7fb' }}>Source</strong><br />{detailItem.source}</div>
            </div>

            {/* Step-by-step history */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Approval Steps ({detailItem.steps.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {detailItem.steps.map((step, i) => {
                  const isCurrent = i === detailItem.currentStepIndex && detailItem.status === 'pending';
                  const stepColor = step.status === 'approved' ? '#10b981' : step.status === 'rejected' ? '#ef4444' : isCurrent ? '#f59e0b' : '#64748b';
                  return (
                    <div
                      key={`${step.key}-${i}`}
                      style={{
                        display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                        padding: '0.65rem 0.85rem', borderRadius: 8,
                        background: isCurrent ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isCurrent ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: `${stepColor}22`, border: `1.5px solid ${stepColor}66`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 800, color: stepColor,
                      }}>
                        {step.status === 'approved' ? '✓' : step.status === 'rejected' ? '✕' : isCurrent ? '→' : String(i + 1)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#f4f7fb' }}>{step.label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginTop: '0.15rem' }}>
                          Role: {step.actorRole}
                          {step.decidedBy ? ` · ${step.status} by ${step.decidedBy}` : ''}
                          {step.decidedAt ? ` · ${new Date(step.decidedAt).toLocaleString()}` : ''}
                          {isCurrent ? ' · Awaiting decision' : ''}
                        </div>
                      </div>
                      <span style={{
                        padding: '0.15rem 0.45rem', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                        background: `${stepColor}22`, color: stepColor, border: `1px solid ${stepColor}44`,
                        flexShrink: 0, alignSelf: 'center',
                      }}>
                        {isCurrent && step.status === 'pending' ? 'current' : step.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions if user can act */}
            {(() => {
              const canAct = canActOnCurrentStep(detailItem, role);
              const currentStep = detailItem.steps[detailItem.currentStepIndex];
              if (!canAct || detailItem.status !== 'pending') return null;
              return (
                <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    type="button"
                    className={adminStyles.primary}
                    disabled={busy}
                    onClick={() => { decide(detailItem.id, 'approved'); setDetailItem(null); }}
                  >
                    Approve — {currentStep?.label}
                  </button>
                  <button
                    type="button"
                    className={adminStyles.ghost}
                    disabled={busy}
                    onClick={() => { decide(detailItem.id, 'rejected'); setDetailItem(null); }}
                  >
                    Reject
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workflow</p>
          <h1>Approvals</h1>
          <p className={styles.lede}>
            Multi-step templates: IT → Owner, Manager → Exec → Owner, or single decide
            {prefs?.approvalsSeedFromDecisions
              ? '. Snapshot seeds use IT → Owner.'
              : '.'}
            {serverSync ? ' · server-synced' : ' · local'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/settings" className={styles.ghostBtn}>
            Approval settings
          </Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
        </div>
      </header>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Request approval</div>
        <form className={adminStyles.form} onSubmit={onCreate}>
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Approve branch spend"
              required
              minLength={3}
            />
          </label>
          <label>
            Template
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value as ApprovalTemplateId)}
            >
              {APPROVAL_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Detail
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Context for the approver"
            />
          </label>
          <p className={styles.lede} style={{ gridColumn: '1 / -1', margin: 0 }}>
            {APPROVAL_TEMPLATES.find((t) => t.id === templateId)?.description}
          </p>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            Submit
          </button>
        </form>
      </section>

      <section className={localStyles.queue}>
        <div className={styles.panelLabel}>Pending · {pending.length}</div>
        {!pending.length ? (
          <p className={styles.lede}>No pending approvals.</p>
        ) : (
          <ul className={localStyles.list}>
            {pending.map((item) => {
              const canAct = canActOnCurrentStep(item, role);
              const step = item.steps[item.currentStepIndex];
              return (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <span className={localStyles.meta}>
                      {item.requester} · {templateLabel(item.templateId)} · step{' '}
                      {(item.currentStepIndex || 0) + 1}/{item.steps.length}: {step?.label}
                      {item.source === 'decision-seed' ? ' · from snapshot' : ''}
                    </span>
                    <ol className={localStyles.steps}>
                      {item.steps.map((s, i) => (
                        <li
                          key={`${item.id}-${s.key}-${i}`}
                          data-status={s.status}
                          data-current={i === item.currentStepIndex && item.status === 'pending'}
                        >
                          {s.label}
                          {s.decidedBy ? ` · ${s.status} by ${s.decidedBy}` : ''}
                        </li>
                      ))}
                    </ol>
                  </div>
                  {canAct ? (
                    <div className={localStyles.actions}>
                      <button
                        type="button"
                        className={adminStyles.primary}
                        disabled={busy}
                        onClick={() => decide(item.id, 'approved')}
                      >
                        Approve step
                      </button>
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        disabled={busy}
                        onClick={() => decide(item.id, 'rejected')}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        onClick={() => setDetailItem(item)}
                      >
                        View details
                      </button>
                    </div>
                  ) : (
                    <div className={localStyles.actions}>
                      <span className={localStyles.meta}>
                        Awaiting {step?.actorRole === 'decider' ? 'decider' : step?.actorRole}
                      </span>
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        onClick={() => setDetailItem(item)}
                      >
                        View details
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {decided.length ? (
        <section className={localStyles.queue}>
          <div className={styles.panelLabel}>Decided · {decided.length}</div>
          <ul className={localStyles.list}>
            {decided.map((item) => (
              <li key={item.id} data-status={item.status}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <span className={localStyles.meta}>
                    {templateLabel(item.templateId)} · {item.status} by {item.decidedBy || '—'}
                    {item.decidedAt ? ` · ${new Date(item.decidedAt).toLocaleString()}` : ''}
                  </span>
                </div>
                <div className={localStyles.actions}>
                  <button
                    type="button"
                    className={adminStyles.ghost}
                    onClick={() => setDetailItem(item)}
                  >
                    View details
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
