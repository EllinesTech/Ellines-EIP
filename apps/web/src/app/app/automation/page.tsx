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
  listAgentTemplates,
  type EllineaAgentDto,
  type AgentTemplateDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import pageStyles from './automation.module.css';

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
  { value: 'reorder', label: 'Trigger Reorder' },
  { value: 'campaign', label: 'Activate Campaign' },
  { value: 'custom', label: 'Custom Action' },
];

const CATEGORY_LABELS: Record<string, string> = {
  approval: 'Approvals',
  workflow: 'Workflows',
  alert: 'Alerts',
  sync: 'Sync',
  general: 'General',
};

export default function AutomationPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [agents, setAgents] = useState<EllineaAgentDto[]>([]);
  const [templates, setTemplates] = useState<AgentTemplateDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'my-agents' | 'templates' | 'create'>('my-agents');

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

    listAgents().then(setAgents).catch(() => setAgents([]));
    listAgentTemplates().then(setTemplates).catch(() => setTemplates([]));
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
        setName(''); setDescription('');
        setTab('my-agents');
      })
      .catch(() => alert('Failed to create agent'))
      .finally(() => setBusy(false));
  }

  function installTemplate(tmpl: AgentTemplateDto) {
    if (busy) return;
    setBusy(true);
    createAgent({
      name: tmpl.name,
      description: tmpl.description,
      templateId: tmpl.slug,
      trigger: tmpl.trigger,
      triggerConfig: tmpl.triggerConfig,
      condition: tmpl.condition,
      action: tmpl.action,
      confidenceThreshold: tmpl.confidenceThreshold,
      requireApproval: tmpl.requireApproval,
    })
      .then((agent) => {
        setAgents((prev) => [agent, ...prev]);
        setTemplates((prev) =>
          prev.map((t) => (t.slug === tmpl.slug ? { ...t, installed: true } : t)),
        );
        setTab('my-agents');
      })
      .catch(() => alert('Failed to install template'))
      .finally(() => setBusy(false));
  }

  function toggleActive(id: string, isActive: boolean) {
    if (busy) return;
    setBusy(true);
    updateAgent(id, { isActive: !isActive })
      .then((updated) => setAgents((prev) => prev.map((a) => (a.id === id ? updated : a))))
      .catch(() => alert('Failed to update agent'))
      .finally(() => setBusy(false));
  }

  function remove(id: string) {
    if (busy || !confirm('Delete this agent? This cannot be undone.')) return;
    setBusy(true);
    deleteAgent(id)
      .then(() => setAgents((prev) => prev.filter((a) => a.id !== id)))
      .catch(() => alert('Failed to delete agent'))
      .finally(() => setBusy(false));
  }

  function runNow(id: string) {
    if (busy) return;
    setBusy(true);
    executeAgent(id, { triggeredBy: 'manual', confidence: 0.8 })
      .then(() => listAgents().then(setAgents))
      .catch(() => alert('Failed to execute agent'))
      .finally(() => setBusy(false));
  }

  if (!allowed) {
    return <div className={styles.page}><p className={styles.lede}>Checking access…</p></div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>v2.0 — Phase A</p>
          <h1>Autonomous Agents</h1>
          <p className={styles.lede}>
            Ellinea AI agents that act on enterprise events — auto-approve, escalate, reorder, or trigger campaigns.
            Set a confidence threshold; below it the agent queues for human approval.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/rules" className={styles.ghostBtn}>Rules</Link>
          <Link href="/app" className={styles.ghostBtn}>Overview</Link>
        </div>
      </header>

      {/* Tabs */}
      <div className={pageStyles.tabs}>
        <button
          type="button"
          className={tab === 'my-agents' ? pageStyles.tabActive : pageStyles.tab}
          onClick={() => setTab('my-agents')}
        >
          My Agents · {agents.length}
        </button>
        <button
          type="button"
          className={tab === 'templates' ? pageStyles.tabActive : pageStyles.tab}
          onClick={() => setTab('templates')}
        >
          Templates · {templates.length}
        </button>
        <button
          type="button"
          className={tab === 'create' ? pageStyles.tabActive : pageStyles.tab}
          onClick={() => setTab('create')}
        >
          + Create custom
        </button>
      </div>

      {/* ── My Agents ─────────────────────────────────────────────────── */}
      {tab === 'my-agents' && (
        <section className={adminStyles.tableWrap}>
          {!agents.length ? (
            <div className={pageStyles.empty}>
              <p>No agents yet.</p>
              <p>
                <button type="button" className={adminStyles.primary} onClick={() => setTab('templates')}>
                  Browse templates
                </button>
                {' '}or{' '}
                <button type="button" className={adminStyles.ghost} onClick={() => setTab('create')}>
                  create custom
                </button>
              </p>
            </div>
          ) : (
            <table className={adminStyles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trigger</th>
                  <th>Confidence</th>
                  <th>Runs</th>
                  <th>Success</th>
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
                        <div style={{ fontSize: '0.8rem', opacity: 0.65, marginTop: '0.15rem' }}>
                          {agent.description.slice(0, 80)}
                          {agent.description.length > 80 ? '…' : ''}
                        </div>
                      )}
                    </td>
                    <td><code className={adminStyles.actionCode}>{agent.trigger}</code></td>
                    <td>{Math.round(agent.confidenceThreshold * 100)}%</td>
                    <td>{agent.executionCount}</td>
                    <td>
                      {agent.executionCount > 0
                        ? `${Math.round((agent.successCount / agent.executionCount) * 100)}%`
                        : '—'}
                    </td>
                    <td>
                      <span className={agent.isActive ? pageStyles.badgeGreen : pageStyles.badgeGray}>
                        {agent.isActive ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        disabled={busy}
                        onClick={() => toggleActive(agent.id, agent.isActive)}
                      >
                        {agent.isActive ? 'Pause' : 'Activate'}
                      </button>{' '}
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        disabled={busy || !agent.isActive}
                        onClick={() => runNow(agent.id)}
                      >
                        Run
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
      )}

      {/* ── Templates Gallery ──────────────────────────────────────────── */}
      {tab === 'templates' && (
        <section>
          <p className={styles.lede} style={{ marginBottom: '1rem' }}>
            Pre-built agent templates. Install with one click — you can edit the agent afterwards.
          </p>
          <div className={pageStyles.gallery}>
            {!templates.length ? (
              <p className={styles.lede}>No templates available.</p>
            ) : (
              templates.map((tmpl) => (
                <div key={tmpl.slug} className={pageStyles.card}>
                  <div className={pageStyles.cardHeader}>
                    <span className={pageStyles.categoryBadge}>
                      {CATEGORY_LABELS[tmpl.category] ?? tmpl.category}
                    </span>
                    {tmpl.featured && (
                      <span className={pageStyles.featuredBadge}>Featured</span>
                    )}
                  </div>
                  <h3 className={pageStyles.cardTitle}>{tmpl.name}</h3>
                  <p className={pageStyles.cardDesc}>{tmpl.description}</p>
                  <div className={pageStyles.cardMeta}>
                    <span>Trigger: <code>{tmpl.trigger}</code></span>
                    <span>Confidence: {Math.round(tmpl.confidenceThreshold * 100)}%</span>
                    <span>
                      Approval: {tmpl.requireApproval ? 'Always required' : 'Auto when confident'}
                    </span>
                  </div>
                  <div className={pageStyles.cardActions}>
                    {tmpl.installed ? (
                      <span className={pageStyles.badgeGreen}>Installed</span>
                    ) : (
                      <button
                        type="button"
                        className={adminStyles.primary}
                        disabled={busy}
                        onClick={() => installTemplate(tmpl)}
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* ── Create Custom ─────────────────────────────────────────────── */}
      {tab === 'create' && (
        <section className={styles.brief}>
          <div className={styles.panelLabel}>Custom agent</div>
          <form className={adminStyles.form} onSubmit={onAdd}>
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={3}
                placeholder="Auto-approve routine requests"
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
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label>
              Action
              <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
                {ACTION_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label>
              Confidence threshold (0.0 – 1.0)
              <input
                type="number"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                min={0}
                max={1}
                step={0.05}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
              />
              Always require human approval (ignore confidence)
            </label>
            <button type="submit" className={adminStyles.primary} disabled={busy}>
              Create agent
            </button>
          </form>
        </section>
      )}

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className={styles.brief} style={{ marginTop: '2rem', borderTop: '1px solid var(--border)' }}>
        <div className={styles.panelLabel}>How Ellinea agents work</div>
        <p className={styles.lede} style={{ maxWidth: '60ch' }}>
          Each agent listens for a <strong>trigger</strong> (an enterprise event), evaluates its
          <strong> condition</strong> against live data, then Ellinea AI assigns a
          <strong> confidence score</strong>. If confidence ≥ threshold the agent acts automatically.
          Below threshold it queues an execution for human approval.
          Every action is logged in the audit trail and can be rolled back within 24 h.
        </p>
      </section>
    </div>
  );
}
