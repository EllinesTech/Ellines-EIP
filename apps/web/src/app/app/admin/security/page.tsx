'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';
import { isOrgAdminRole } from '@ellines-eip/shared';
import styles from '../../../app/command.module.css';
import adminStyles from '../admin.module.css';

// ── Local types ───────────────────────────────────────────────────────────────

interface SecurityPolicy {
  organizationId: string;
  anomalySensitivity: number;
  exfiltrationThresholdMultiplier: number;
  impossibleTravelWindowHours: number;
  autoRemediationEnabled: Record<string, boolean>;
  notifyChannels: string[];
  updatedAt: string;
}

interface SecurityEvent {
  id: string;
  userId: string;
  type: string;
  severity: string;
  confidence: number;
  timestamp: string;
  resolved: boolean;
  evidence: { description: string };
}

const SECURITY_API_BASE = process.env.NEXT_PUBLIC_SELF_HEALING_URL ?? 'http://localhost:3005';

const EVENT_TYPES = [
  'unusual_access',
  'data_exfiltration',
  'impossible_travel',
  'privilege_escalation',
  'concurrent_session',
  'brute_force',
  'suspicious_api_usage',
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#fca5a5',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#6ee7b7',
};

// ── Page component ────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form state
  const [sensitivity, setSensitivity] = useState(0.7);
  const [exfilMultiplier, setExfilMultiplier] = useState(3);
  const [travelWindowHours, setTravelWindowHours] = useState(1);
  const [autoRemediation, setAutoRemediation] = useState<Record<string, boolean>>({});
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!isOrgAdminRole(s.user.role)) {
      router.replace('/app');
      return;
    }
    setOrgId(s.user.organizationId ?? '');
    setAllowed(true);
  }, [router]);

  async function loadPolicy(id: string) {
    try {
      const res = await fetch(`${SECURITY_API_BASE}/security/policy/${id}`);
      if (!res.ok) return;
      const data: SecurityPolicy = await res.json();
      setPolicy(data);
      setSensitivity(data.anomalySensitivity);
      setExfilMultiplier(data.exfiltrationThresholdMultiplier);
      setTravelWindowHours(data.impossibleTravelWindowHours);
      setAutoRemediation(data.autoRemediationEnabled ?? {});
    } catch {
      // self-healing service may not be running locally — gracefully degrade
    }
  }

  async function loadEvents(id: string) {
    try {
      const res = await fetch(
        `${SECURITY_API_BASE}/security/events?orgId=${id}&unresolved=${!showResolved}&limit=20`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      // degrade gracefully
    }
  }

  useEffect(() => {
    if (!allowed || !orgId) return;
    setLoading(true);
    void Promise.all([loadPolicy(orgId), loadEvents(orgId)]).finally(() =>
      setLoading(false),
    );
  }, [allowed, orgId, showResolved]);

  async function onSavePolicy(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${SECURITY_API_BASE}/security/policy/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anomalySensitivity: sensitivity,
          exfiltrationThresholdMultiplier: exfilMultiplier,
          impossibleTravelWindowHours: travelWindowHours,
          autoRemediationEnabled: autoRemediation,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: SecurityPolicy = await res.json();
      setPolicy(updated);
      setNotice('Security policy saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save policy');
    } finally {
      setBusy(false);
    }
  }

  async function resolveEvent(eventId: string) {
    setBusy(true);
    try {
      await fetch(`${SECURITY_API_BASE}/security/events/${eventId}/resolve`, {
        method: 'PATCH',
      });
      await loadEvents(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve event');
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking access…</p>
      </div>
    );
  }

  const unresolvedCount = events.filter((e) => !e.resolved).length;

  return (
    <div className={styles.page}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Security</p>
          <h1>Advanced Security &amp; Anomaly Detection</h1>
          <p className={styles.lede}>
            Configure detection thresholds, manage auto-remediation rules, and
            review recent security incidents for your organization.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app" className={styles.ghostBtn}>Overview</Link>
          <Link href="/app/admin" className={styles.ghostBtn}>Users &amp; access</Link>
          <Link href="/app/connectors" className={styles.ghostBtn}>Connectors</Link>
          <Link href="/app/audit" className={styles.ghostBtn}>Audit</Link>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div className={styles.kpis} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: '0.75rem' }}>
        <div className={styles.kpi}>
          <span>Open Incidents</span>
          <strong style={{ color: unresolvedCount > 0 ? '#fca5a5' : '#34d399' }}>
            {loading ? '—' : unresolvedCount}
          </strong>
          <em>unresolved security events</em>
        </div>
        <div className={styles.kpi}>
          <span>Detection Sensitivity</span>
          <strong>{Math.round(sensitivity * 100)}%</strong>
          <em>anomaly detection strictness</em>
        </div>
        <div className={styles.kpi}>
          <span>Auto-Remediation</span>
          <strong>
            {Object.values(autoRemediation).filter(Boolean).length}/
            {EVENT_TYPES.length}
          </strong>
          <em>event types with auto-remediation on</em>
        </div>
      </div>

      {/* ── Policy configuration form ─────────────────────────────────────── */}
      <section className={styles.brief} style={{ marginBottom: '0.7rem' }}>
        <div className={styles.panelLabel}>Security Policy Configuration</div>
        <form className={adminStyles.form} onSubmit={(e) => void onSavePolicy(e)}>
          {/* Sensitivity */}
          <label>
            Anomaly Sensitivity
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            />
          </label>
          {/* Exfiltration multiplier */}
          <label>
            Exfiltration Threshold (×baseline)
            <input
              type="number"
              min={1}
              max={20}
              step={0.5}
              value={exfilMultiplier}
              onChange={(e) => setExfilMultiplier(parseFloat(e.target.value))}
            />
          </label>
          {/* Impossible travel window */}
          <label>
            Impossible Travel Window (hours)
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={travelWindowHours}
              onChange={(e) => setTravelWindowHours(parseFloat(e.target.value))}
            />
          </label>
          <button
            type="submit"
            className={adminStyles.primary}
            disabled={busy}
            style={{ gridColumn: '1 / -1', maxWidth: 160 }}
          >
            {busy ? 'Saving…' : 'Save policy'}
          </button>
        </form>

        {/* Auto-remediation toggles */}
        <div style={{ marginTop: '0.85rem' }}>
          <div className={styles.panelLabel} style={{ marginBottom: '0.4rem' }}>
            Auto-Remediation Rules
          </div>
          <p className={styles.lede} style={{ marginBottom: '0.55rem' }}>
            When enabled, the Self-Healing System automatically takes protective
            actions (session termination, rate limiting) when a threat is
            detected with high confidence.
          </p>
          <ul className={adminStyles.structList}>
            {EVENT_TYPES.map((type) => (
              <li key={type} style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoRemediation[type] ?? false}
                    onChange={(e) =>
                      setAutoRemediation((prev) => ({
                        ...prev,
                        [type]: e.target.checked,
                      }))
                    }
                    style={{ accentColor: '#7c3aed', width: 14, height: 14 }}
                  />
                  <strong style={{ fontSize: '0.82rem', color: '#f4f7fb', fontWeight: 600 }}>
                    {type.replace(/_/g, ' ')}
                  </strong>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#8b95a8' }}>
                    {autoRemediation[type] ? 'enabled' : 'disabled'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {policy ? (
          <p className={styles.lede} style={{ marginTop: '0.65rem' }}>
            Last saved:{' '}
            {policy.updatedAt !== '1970-01-01T00:00:00.000Z'
              ? new Date(policy.updatedAt).toLocaleString()
              : 'Using defaults'}
          </p>
        ) : null}
      </section>

      {/* ── Recent security events ────────────────────────────────────────── */}
      <section className={adminStyles.tableWrap}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.5rem',
          }}
        >
          <div className={styles.panelLabel}>
            Recent Security Incidents
            {unresolvedCount > 0 && (
              <span
                style={{
                  marginLeft: '0.5rem',
                  background: 'rgba(239,68,68,0.2)',
                  color: '#fca5a5',
                  border: '1px solid rgba(239,68,68,0.35)',
                  borderRadius: 999,
                  padding: '0.1rem 0.5rem',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                }}
              >
                {unresolvedCount} open
              </span>
            )}
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.75rem',
              color: '#8b95a8',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              style={{ accentColor: '#7c3aed' }}
            />
            Show resolved
          </label>
        </div>

        {loading ? (
          <p className={styles.lede}>Loading incidents…</p>
        ) : events.length === 0 ? (
          <div className={styles.emptyCallout}>
            <div>
              <strong>No security incidents</strong>
              <p>
                No anomalies detected{showResolved ? '' : ' (unresolved)'}. The
                self-healing service monitors sessions in real-time.
              </p>
            </div>
          </div>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>User ID</th>
                <th>Severity</th>
                <th>Confidence</th>
                <th>Description</th>
                <th>Time</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    <code
                      className={adminStyles.actionCode}
                      style={{ fontSize: '0.72rem' }}
                    >
                      {ev.type.replace(/_/g, ' ')}
                    </code>
                  </td>
                  <td style={{ fontSize: '0.72rem', color: '#8b95a8' }}>
                    {ev.userId.slice(0, 8)}…
                  </td>
                  <td>
                    <span
                      style={{
                        color: SEVERITY_COLORS[ev.severity] ?? '#f4f7fb',
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      {ev.severity}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.78rem' }}>
                    {Math.round(ev.confidence * 100)}%
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#c5cddb', maxWidth: 280 }}>
                    {ev.evidence?.description ?? '—'}
                  </td>
                  <td style={{ fontSize: '0.72rem', color: '#8b95a8', whiteSpace: 'nowrap' }}>
                    {new Date(ev.timestamp).toLocaleString()}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: ev.resolved ? '#34d399' : '#fbbf24',
                        textTransform: 'uppercase',
                      }}
                    >
                      {ev.resolved ? 'resolved' : 'open'}
                    </span>
                  </td>
                  <td>
                    {!ev.resolved ? (
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        disabled={busy}
                        onClick={() => void resolveEvent(ev.id)}
                      >
                        Resolve
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Info panel ────────────────────────────────────────────────────── */}
      <section className={styles.brief} style={{ marginTop: '0.7rem' }}>
        <div className={styles.panelLabel}>How detection works</div>
        <ul
          style={{
            margin: '0.4rem 0 0',
            paddingLeft: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <li className={styles.lede}>
            <strong style={{ color: '#f4f7fb' }}>User behavior profiling</strong> — The engine
            builds a per-role, per-department baseline from session history using
            exponential moving averages.
          </li>
          <li className={styles.lede}>
            <strong style={{ color: '#f4f7fb' }}>Data exfiltration</strong> — Flags sessions
            where download/export volume exceeds{' '}
            <strong style={{ color: '#f4f7fb' }}>{exfilMultiplier}×</strong> the role baseline.
          </li>
          <li className={styles.lede}>
            <strong style={{ color: '#f4f7fb' }}>Impossible travel</strong> — Detects
            concurrent active sessions from IPs in different countries within{' '}
            <strong style={{ color: '#f4f7fb' }}>{travelWindowHours}h</strong>.
          </li>
          <li className={styles.lede}>
            <strong style={{ color: '#f4f7fb' }}>Privilege escalation</strong> — Flags attempts
            to access API endpoints outside the user&apos;s role-allowed path prefixes.
          </li>
          <li className={styles.lede}>
            <strong style={{ color: '#f4f7fb' }}>Protective actions</strong> — With
            auto-remediation on, the system automatically terminates sessions,
            applies rate limits, or flags accounts when confidence is ≥ 80%.
          </li>
        </ul>
      </section>
    </div>
  );
}
