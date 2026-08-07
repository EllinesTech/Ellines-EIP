'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_RULES,
  readBusinessRules,
  writeBusinessRules,
  type BusinessRule,
} from '@/lib/business-rules';
import {
  getSession,
  listRules,
  createRuleApi,
  toggleRuleApi,
  deleteRuleApi,
  listEnterpriseEvents,
  publishEnterpriseEventApi,
  type BusinessRuleDto,
  type EnterpriseEventDto,
} from '@/lib/api';
import { publishEnterpriseEvent, readEnterpriseEvents } from '@/lib/event-bus';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

function fromDto(dto: BusinessRuleDto): BusinessRule {
  return {
    id: dto.id,
    name: dto.name,
    enabled: dto.enabled,
    when: dto.when,
    threshold: dto.threshold,
    then: dto.then,
    createdAt: dto.createdAt,
  };
}

export default function RulesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rules, setRules] = useState<BusinessRule[]>(DEFAULT_RULES);
  const [events, setEvents] = useState<{ id: string; type: string; at: string }[]>([]);
  const [serverSync, setServerSync] = useState(false);
  const [name, setName] = useState('');
  const [when, setWhen] = useState<BusinessRule['when']>('open_alerts_gte');
  const [threshold, setThreshold] = useState(3);
  const [then, setThen] = useState<BusinessRule['then']>('flag_overview');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    if (!isOrgAdminRole(s.user.role)) { router.replace('/app'); return; }
    setAllowed(true);
    setOrgId(s.organization.id);

    // Load rules — server first, localStorage fallback
    listRules()
      .then((dtos) => {
        const serverRules = dtos.map(fromDto);
        setRules(serverRules.length ? serverRules : DEFAULT_RULES);
        setServerSync(true);
        if (serverRules.length) writeBusinessRules(s.organization.id, serverRules);
      })
      .catch(() => {
        setRules(readBusinessRules(s.organization.id));
      });

    // Load events — server first, localStorage fallback
    listEnterpriseEvents(50)
      .then((evts: EnterpriseEventDto[]) => setEvents(evts))
      .catch(() => setEvents(readEnterpriseEvents().slice(0, 50)));
  }, [router]);

  function persist(next: BusinessRule[]) {
    if (!orgId) return;
    setRules(next);
    if (!serverSync) writeBusinessRules(orgId, next);
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);

    if (serverSync) {
      createRuleApi({ name: name.trim(), when, threshold, then })
        .then((dto) => {
          const r = fromDto(dto);
          setRules((prev) => [r, ...prev]);
          // Also publish event
          void publishEnterpriseEventApi({ type: 'rules.updated', payload: { count: 1 } })
            .then((evt) => setEvents((prev) => [evt, ...prev].slice(0, 50)))
            .catch(() => undefined);
          setName('');
        })
        .catch(() => {
          const rule: BusinessRule = {
            id: `rule_${Date.now()}`,
            name: name.trim(), enabled: true, when, threshold, then,
            createdAt: new Date().toISOString(),
          };
          persist([rule, ...rules]);
          publishEnterpriseEvent('rules.updated', { count: rules.length + 1 });
          setEvents(readEnterpriseEvents().slice(0, 50));
          setName('');
        })
        .finally(() => setBusy(false));
      return;
    }

    const rule: BusinessRule = {
      id: `rule_${Date.now()}`, name: name.trim(), enabled: true,
      when, threshold, then, createdAt: new Date().toISOString(),
    };
    persist([rule, ...rules]);
    publishEnterpriseEvent('rules.updated', { count: rules.length + 1 });
    setEvents(readEnterpriseEvents().slice(0, 50));
    setName('');
    setBusy(false);
  }

  function toggle(id: string) {
    const rule = rules.find((r) => r.id === id);
    if (!rule || busy) return;
    const nextEnabled = !rule.enabled;

    if (serverSync) {
      setBusy(true);
      toggleRuleApi(id, nextEnabled)
        .then((dto) => setRules((prev) => prev.map((r) => r.id === id ? fromDto(dto) : r)))
        .catch(() => persist(rules.map((r) => r.id === id ? { ...r, enabled: nextEnabled } : r)))
        .finally(() => setBusy(false));
      return;
    }
    persist(rules.map((r) => r.id === id ? { ...r, enabled: nextEnabled } : r));
  }

  function remove(id: string) {
    if (busy) return;
    if (serverSync) {
      setBusy(true);
      deleteRuleApi(id)
        .then(() => setRules((prev) => prev.filter((r) => r.id !== id)))
        .catch(() => persist(rules.filter((r) => r.id !== id)))
        .finally(() => setBusy(false));
      return;
    }
    persist(rules.filter((r) => r.id !== id));
  }

  if (!allowed) return <div className={styles.page}><p className={styles.lede}>Checking access…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workflow</p>
          <h1>Business rules</h1>
          <p className={styles.lede}>
            If/then rules on enterprise snapshot metrics. Changes publish to the event bus.
            {serverSync ? ' · server-synced' : ' · local'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/approvals" className={styles.ghostBtn}>Approvals</Link>
          <Link href="/app" className={styles.ghostBtn}>Overview</Link>
        </div>
      </header>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Add rule</div>
        <form className={adminStyles.form} onSubmit={onAdd}>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required minLength={3}
              placeholder="Escalate critical alerts"
            />
          </label>
          <label>
            When
            <select value={when} onChange={(e) => setWhen(e.target.value as BusinessRule['when'])}>
              <option value="open_alerts_gte">Open alerts ≥</option>
              <option value="open_decisions_gte">Open decisions ≥</option>
              <option value="health_lt">Health score &lt;</option>
            </select>
          </label>
          <label>
            Threshold
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 0)}
              min={0} max={100}
            />
          </label>
          <label>
            Then
            <select value={then} onChange={(e) => setThen(e.target.value as BusinessRule['then'])}>
              <option value="flag_overview">Flag Overview</option>
              <option value="seed_approval">Suggest approval</option>
            </select>
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>Add rule</button>
        </form>
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Active rules · {rules.length}</div>
        {!rules.length ? (
          <p className={styles.lede}>No rules yet.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th><th>When</th><th>Then</th><th>On</th><th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td><code className={adminStyles.actionCode}>{r.when} {r.threshold}</code></td>
                  <td>{r.then}</td>
                  <td>{r.enabled ? 'Yes' : 'No'}</td>
                  <td>
                    <button type="button" className={adminStyles.ghost} disabled={busy} onClick={() => toggle(r.id)}>
                      {r.enabled ? 'Disable' : 'Enable'}
                    </button>{' '}
                    <button type="button" className={adminStyles.ghost} disabled={busy} onClick={() => remove(r.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={adminStyles.tableWrap} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>
          Event bus · recent · {events.length}
        </div>
        <p className={styles.lede}>
          Approval decisions, rule changes, and report runs publish here.
          {serverSync ? ' Server-persisted.' : ' Local pub/sub stub.'}
        </p>
        <ul className={adminStyles.structList}>
          {events.slice(0, 8).map((e) => (
            <li key={e.id}>
              <strong>{e.type}</strong>
              <span>{new Date(e.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
