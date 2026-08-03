'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import {
  getSession,
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  executeAgent,
  type EllineaAgentDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

const TRIGGER_OPTIONS = [
  { value: 'approval_pending', label: 'Approval Pending' },
  { value: 'alert_threshold', label: 'Alert Threshold' },
  { value: 'sync_complete', label: 'Sync Complete' },
  { value: 'manual', label: 'Manual Only' },
];

const ACTION_TYPES = [
  { value: 'auto_approve', label: 'Auto-approve' },
  { value: 'escalate', label: 'Escalate to Owner' },
  { value: 'notify', label: 'Send Notification' },
  { value: 'custom', label: 'Custom Action' },
];

export default function AutomationPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [agents, setAgents] = useState<EllineaAgentDto[]>([]);
  const [busy, setBusy] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('approval_pending');
  const [actionType, setActionType] = useState('auto_approve');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [requireApproval, setRequireApproval] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    if (!isOrgAdminRole(s.user.role)) { router.replace('/app'); return; }
    setAllowed(true);

    // Load agents
    listAgents()
      .then(setAgents)
      .catch((err) => {
        console.error('Failed to load agents:', err);
        setAgents([]);
      });
  }, [router]);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);

    createAgent({
      name: name.trim(),
      description: description.trim(),
      trigger,
      action: { type: actionType },
      confidenceThreshold,
      requireApproval,
    })
      .then((agent) => {
        setAgents((prev) => [agent, ...prev]);
        setName('');
        setDescription('');
      })
      .catch((err) => {
        console.error('Failed to create agent:', err);
        alert('Failed to create agent');
      })
      .finally(() => setBusy(false));
  }

  function toggleActive(id: string, isActive: boolean) {
    if (busy) return;
    setBusy(true);
    updateAgent(id, { isActive: !isActive })
      .then((updated) => {
        setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
      })
      .catch((err) => {
        console.error('Failed to toggle agent:', err);
        alert('Failed to toggle agent');
      })
      .finally(() => setBusy(false));
  }

  function remove(id: string) {
    if (busy) return;
    if (!confirm('Delete this agent?')) return;
    setBusy(true);
    deleteAgent(id)
      .then(() => {
        setAgents((prev) => prev.filter((a) => a.id !== id));
      })
      .catch((err) => {
        console.error('Failed to delete agent:', err);
        alert('Failed to delete agent');
      })
      .finally(() => setBusy(false));
  }

  function runNow(id: string) {
    if (busy) return;
    setBusy(true);
    executeAgent(id, { triggeredBy: 'manual', confidence: 0.8 })
      .then(() => {
        alert('Agent executed successfully');
        return listAgents();
      })
      .then(setAgents)
      .catch((err) => {
        console.error('Failed to execute agent:', err);
        alert('Failed to execute agent');
      })
      .finally(() => setBusy(false));
  }

  if (!allowed) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking access…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>v2.0 Phase A</p>
          <h1>Autonomous Agents</h1>
          <p className={styles.lede}>
            Ellinea AI agents that act on enterprise events. Configure trigger, condition, action, and confidence thresholds.
            Agents can auto-approve, escalate, or execute custom actions.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/rules" className={styles.ghostBtn}>Rules</Link>
          <Link href="/app" className={styles.ghostBtn}>Overview</Link>
        </div>
      </header>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Create agent</div>
        <form className={adminStyles.form} onSubmit={onAdd}>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={3}
              placeholder="Auto-approve low-value requests"
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </label>
          <label>
            Trigger
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Action
            <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
              {ACTION_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Confidence Threshold (0.0–1.0)
            <input
              type="number"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value) || 0.5)}
              min={0}
              max={1}
              step={0.1}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
            />
            Always require human approval
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            Create agent
          </button>
        </form>
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Active agents · {agents.length}</div>
        {!agents.length ? (
          <p className={styles.lede}>No agents yet. Create one above to get started.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Trigger</th>
                <th>Executions</th>
                <th>Success Rate</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    <strong>{agent.name}</strong>
                    {agent.description && (
                      <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                        {agent.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <code className={adminStyles.actionCode}>{agent.trigger}</code>
                  </td>
                  <td>{agent.executionCount}</td>
                  <td>
                    {agent.executionCount > 0
                      ? `${Math.round((agent.successCount / agent.executionCount) * 100)}%`
                      : 'N/A'}
                  </td>
                  <td>{agent.isActive ? 'Yes' : 'No'}</td>
                  <td>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy}
                      onClick={() => toggleActive(agent.id, agent.isActive)}
                    >
                      {agent.isActive ? 'Deactivate' : 'Activate'}
                    </button>{' '}
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy || !agent.isActive}
                      onClick={() => runNow(agent.id)}
                    >
                      Run Now
                    </button>{' '}
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy}
                      onClick={() => remove(agent.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.brief} style={{ marginTop: '1.5rem' }}>
        <div className={styles.panelLabel}>How it works</div>
        <p className={styles.lede} style={{ maxWidth: '60ch' }}>
          <strong>Autonomous agents</strong> monitor enterprise events and take action based on configured rules.
          Each agent has a confidence threshold (0.0–1.0). If the agent's confidence exceeds the threshold,
          it executes automatically. Otherwise, it queues for human approval.
        </p>
        <p className={styles.lede} style={{ maxWidth: '60ch', marginTop: '0.5rem' }}>
          Agents can auto-approve low-risk requests, escalate high-risk items to the Owner, send notifications,
          or execute custom workflows. All actions are logged in the audit trail.
        </p>
      </section>
    </div>
  );
}
