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

  return (
    <div className={styles.page}>
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
                    </div>
                  ) : (
                    <span className={localStyles.meta}>
                      Awaiting {step?.actorRole === 'decider' ? 'decider' : step?.actorRole}
                    </span>
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
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
