'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  canDecideApprovals,
  readApprovals,
  seedApprovalsFromSummary,
  writeApprovals,
  type ApprovalRequest,
} from '@/lib/approvals';
import { fetchEnterpriseSummary, getSession } from '@/lib/api';
import { readUiPrefs, type UiPrefs } from '@/lib/ui-prefs';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import localStyles from './approvals.module.css';

export default function ApprovalsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState('member');
  const [actorName, setActorName] = useState('');
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [prefs, setPrefs] = useState<UiPrefs | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    const ui = readUiPrefs();
    setPrefs(ui);
    setOrgId(session.organization.id);
    setRole(session.user.role);
    setActorName(session.user.fullName);

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
  }, []);

  function persist(next: ApprovalRequest[]) {
    if (!orgId) return;
    setItems(next);
    writeApprovals(orgId, next);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const next: ApprovalRequest = {
      id: `appr_${Date.now()}`,
      title: title.trim(),
      detail: detail.trim() || 'Manual approval request',
      requester: actorName || 'You',
      status: 'pending',
      createdAt: new Date().toISOString(),
      source: 'manual',
    };
    persist([next, ...items]);
    setTitle('');
    setDetail('');
  }

  function decide(id: string, status: 'approved' | 'rejected') {
    if (!canDecideApprovals(role)) return;
    setBusy(true);
    persist(
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              decidedAt: new Date().toISOString(),
              decidedBy: actorName || role,
            }
          : item,
      ),
    );
    setBusy(false);
  }

  const pending = items.filter((i) => i.status === 'pending');
  const decided = items.filter((i) => i.status !== 'pending');
  const canDecide = canDecideApprovals(role);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workflow</p>
          <h1>Approvals</h1>
          <p className={styles.lede}>
            Multi-step server workflows come next. This queue is org-local for now
            {prefs?.approvalsSeedFromDecisions ? ' and seeds from open decisions after sync.' : '.'}
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
          <label style={{ gridColumn: 'span 2' }}>
            Detail
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Context for the approver"
            />
          </label>
          <button type="submit" className={adminStyles.primary}>
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
            {pending.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <span className={localStyles.meta}>
                    {item.requester} · {new Date(item.createdAt).toLocaleString()}
                    {item.source === 'decision-seed' ? ' · from snapshot' : ''}
                  </span>
                </div>
                {canDecide ? (
                  <div className={localStyles.actions}>
                    <button
                      type="button"
                      className={adminStyles.primary}
                      disabled={busy}
                      onClick={() => decide(item.id, 'approved')}
                    >
                      Approve
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
                  <span className={localStyles.meta}>Awaiting Owner / IT / exec / manager</span>
                )}
              </li>
            ))}
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
                    {item.status} by {item.decidedBy || '—'}
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
