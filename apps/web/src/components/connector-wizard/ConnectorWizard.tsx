'use client';

/**
 * ConnectorWizard — 8-step guided connector setup request flow.
 *
 * Business rules:
 * - Submitting at Step 8 creates an IntegrationRequest (status=PENDING).
 * - It does NOT install or activate a connector — that's a Platform Admin operation.
 * - State is persisted to sessionStorage (key: eip_wizard_{orgId}).
 * - Credentials in authConfig are held in component state ONLY — never written to sessionStorage.
 * - On refresh at Step 3, user must re-enter credentials.
 * - SSRF-blocked URL at Step 4 → show error, stay on Step 4.
 *
 * Requirements: 24.1–24.7, 12.6
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep =
  | 'IDLE'
  | 'STEP_1_SYSTEM_TYPE'
  | 'STEP_2_ACCESS_METHOD'
  | 'STEP_3_AUTH'
  | 'STEP_4_TEST'
  | 'STEP_5_DISCOVERY'
  | 'STEP_6_MAPPING'
  | 'STEP_7_CAPABILITIES'
  | 'STEP_8_ENABLE'
  | 'SUBMITTED';

interface AuthConfig {
  type: string;
  apiKey?: string;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  baseUrl?: string;
}

interface TestResult {
  success: boolean;
  latencyMs?: number;
  statusCode?: number;
  message: string;
}

/** Persisted to sessionStorage — credentials excluded. */
interface PersistedWizardState {
  step: WizardStep;
  systemType: string | null;
  accessMethod: string | null;
  testResult: TestResult | null;
  discoverySnapshot: unknown;
  capabilities: string[];
  orgId: string;
}

interface ConnectorWizardProps {
  orgId: string;
  onSubmitted?: (integrationRequestId: string) => void;
  onClose?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// NOTE: EIP deliberately has no fixed list of system categories. A connected
// system is not one of ERP/POS/CRM — it is one connection that may expose any
// number of capabilities, and the source itself is the authority on which.
// CATEGORIES_DISABLED: the previous hardcoded list (ERP, POS, CRM, HR,
// Accounting, Hospital, Website, Database, REST API, Other) is intentionally
// removed so a business is never asked to squeeze its system into a box.
void 0;

const ACCESS_METHODS = [
  { value: 'REST', label: 'REST / HTTP API' },
  { value: 'OpenAPI', label: 'OpenAPI / Swagger document' },
  { value: 'GraphQL', label: 'GraphQL API' },
  { value: 'SOAP', label: 'SOAP Web Service' },
  { value: 'Database', label: 'Direct database connection' },
  { value: 'File_SFTP', label: 'File / SFTP export' },
  { value: 'Webhook', label: 'Webhook / Event push' },
  { value: 'Email', label: 'Email (IMAP)' },
  { value: 'Browser_Automation', label: 'Browser automation (no API)' },
  { value: 'Custom_HTTP', label: 'Custom HTTP' },
];

const AUTH_TYPES = [
  { value: 'API_Key', label: 'API Key' },
  { value: 'Bearer_Token', label: 'Bearer Token' },
  { value: 'Basic_Auth', label: 'Basic Auth (username + password)' },
  { value: 'OAuth2_Client_Credentials', label: 'OAuth 2.0 — Client Credentials' },
  { value: 'OAuth2_Authorization_Code', label: 'OAuth 2.0 — Authorization Code' },
  { value: 'None', label: 'No authentication' },
];

// ─── sessionStorage helpers ───────────────────────────────────────────────────

function storageKey(orgId: string) { return `eip_wizard_${orgId}`; }

function loadState(orgId: string): Partial<PersistedWizardState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(orgId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedWizardState>;
  } catch { return null; }
}

function saveState(state: PersistedWizardState) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(state.orgId), JSON.stringify(state));
  } catch { /* quota exceeded — silent */ }
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-8)',
  maxWidth: 560,
  width: '100%',
  color: 'var(--brand-text)',
  fontFamily: "'Exo 2', system-ui, sans-serif",
};

const btnStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-6)',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  cursor: 'pointer',
  fontSize: 'var(--font-l4-size)',
  fontWeight: 600,
  fontFamily: 'inherit',
};

const primaryBtn: React.CSSProperties = { ...btnStyle, background: 'var(--brand-primary)', color: 'var(--brand-text)' };
const secondaryBtn: React.CSSProperties = { ...btnStyle, background: 'transparent', color: 'var(--brand-text-muted)', border: '1px solid var(--border-default)' };
const dangerBtn: React.CSSProperties = { ...btnStyle, background: 'var(--status-error)', color: 'var(--brand-text)' };

const labelStyle: React.CSSProperties = { fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', marginBottom: 'var(--space-1)', display: 'block' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--surface-base)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--brand-text)',
  fontSize: 'var(--font-l4-size)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

// ─── Component ────────────────────────────────────────────────────────────────

export function ConnectorWizard({ orgId, onSubmitted, onClose }: ConnectorWizardProps) {
  const saved = loadState(orgId);

  const [step, setStep] = useState<WizardStep>(saved?.step ?? 'STEP_1_SYSTEM_TYPE');
  const [systemType, setSystemType] = useState<string>(saved?.systemType ?? '');
  const [accessMethod, setAccessMethod] = useState<string>(saved?.accessMethod ?? '');
  // authConfig held in component state ONLY — never persisted to sessionStorage
  const [authType, setAuthType] = useState('API_Key');
  const [authConfig, setAuthConfig] = useState<Partial<AuthConfig>>({});
  const [testResult, setTestResult] = useState<TestResult | null>(saved?.testResult ?? null);
  const [discoverySnapshot, setDiscoverySnapshot] = useState<unknown>(saved?.discoverySnapshot ?? null);
  const [capabilities, setCapabilities] = useState<string[]>(saved?.capabilities ?? []);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [businessJustification, setBusinessJustification] = useState('');

  // Focus the first interactive element on step change (Req 24.7)
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = stepRef.current?.querySelector<HTMLElement>('input, select, button, textarea');
    first?.focus();
  }, [step]);

  // Persist non-credential state
  useEffect(() => {
    // Never persist authConfig (credentials)
    saveState({ step, systemType, accessMethod, testResult, discoverySnapshot, capabilities, orgId });
  }, [step, systemType, accessMethod, testResult, discoverySnapshot, capabilities, orgId]);

  const next = useCallback((toStep: WizardStep) => setStep(toStep), []);

  // ── Step 4: Connection test ────────────────────────────────────────────────
  const runTest = useCallback(async () => {
    const baseUrl = authConfig.baseUrl;
    if (!baseUrl) {
      setTestResult({ success: false, message: 'Base URL is required.' });
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/v1/connectors/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: baseUrl, authConfig: { type: authType, ...authConfig } }),
      });
      const data = await res.json() as TestResult & { message?: string };
      if (res.status === 422) {
        setTestResult({ success: false, message: data.message ?? 'This URL cannot be reached from EIP' });
        return;
      }
      setTestResult({ success: data.success, latencyMs: data.latencyMs, statusCode: data.statusCode, message: data.message ?? '' });
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setTesting(false);
    }
  }, [authConfig, authType]);

  // ── Step 5: Discovery ────────────────────────────────────────────────────
  const runDiscovery = useCallback(async () => {
    setDiscoverySnapshot({ note: 'Discovery not yet implemented — coming in Phase 2.' });
    next('STEP_6_MAPPING');
  }, [next]);

  // ── Step 8: Submit ────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/connectors/integration-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedSystemName: systemType,
          requestedConnectorType: accessMethod,
          businessJustification,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        alert(err.message ?? 'Submission failed');
        return;
      }
      const data = await res.json() as { id: string };
      // Clear wizard state
      if (typeof window !== 'undefined') sessionStorage.removeItem(storageKey(orgId));
      setStep('SUBMITTED');
      onSubmitted?.(data.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [systemType, accessMethod, businessJustification, orgId, onSubmitted]);

  const stepLabels: WizardStep[] = [
    'STEP_1_SYSTEM_TYPE', 'STEP_2_ACCESS_METHOD', 'STEP_3_AUTH',
    'STEP_4_TEST', 'STEP_5_DISCOVERY', 'STEP_6_MAPPING',
    'STEP_7_CAPABILITIES', 'STEP_8_ENABLE',
  ];
  const currentStepIndex = stepLabels.indexOf(step);

  return (
    <div style={panelStyle} role="dialog" aria-label="Connector Setup Wizard" aria-modal="true">
      {/* Step progress */}
      {currentStepIndex >= 0 && (
        <div aria-label={`Step ${currentStepIndex + 1} of 8`} style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {stepLabels.map((s, i) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: i <= currentStepIndex ? 'var(--brand-primary)' : 'var(--border-default)',
                }}
                aria-hidden="true"
              />
            ))}
          </div>
          <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', marginTop: 'var(--space-2)' }}>
            Step {currentStepIndex + 1} of 8
          </p>
        </div>
      )}

      <div ref={stepRef}>
        {/* ── Step 1 ── */}
        {step === 'STEP_1_SYSTEM_TYPE' && (
          <div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>
              What are you connecting?
            </h2>
            <label htmlFor="system-type-select" style={labelStyle}>
              What does this system call itself?
            </label>
            <input
              id="system-type-select"
              type="text"
              value={systemType}
              onChange={(e) => setSystemType(e.target.value)}
              placeholder="e.g. Acme ERP, Salesworks POS, Clinic Manager"
              style={inputStyle}
              aria-required="true"
            />
            <p style={{ fontSize: 'var(--font-s1-size)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
              This is only a label for your reference. EIP does not limit what this connection
              can do — it discovers the capabilities the system actually exposes.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-6)', gap: 'var(--space-3)' }}>
              {onClose && <button style={secondaryBtn} onClick={onClose}>Cancel</button>}
              <button style={primaryBtn} disabled={!systemType.trim()} onClick={() => next('STEP_2_ACCESS_METHOD')}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 'STEP_2_ACCESS_METHOD' && (
          <div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>
              How does it provide access?
            </h2>
            <label htmlFor="access-method-select" style={labelStyle}>Access method</label>
            <select
              id="access-method-select"
              value={accessMethod}
              onChange={(e) => setAccessMethod(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select access method…</option>
              {ACCESS_METHODS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-6)', gap: 'var(--space-3)' }}>
              <button style={secondaryBtn} onClick={() => next('STEP_1_SYSTEM_TYPE')}>← Back</button>
              <button style={primaryBtn} disabled={!accessMethod} onClick={() => next('STEP_3_AUTH')}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 'STEP_3_AUTH' && (
          <div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>
              Authentication configuration
            </h2>
            <label htmlFor="auth-type-select" style={labelStyle}>Authentication type</label>
            <select id="auth-type-select" value={authType} onChange={(e) => setAuthType(e.target.value)} style={selectStyle}>
              {AUTH_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>

            <div style={{ marginTop: 'var(--space-4)' }}>
              <label htmlFor="base-url-input" style={labelStyle}>Base URL</label>
              <input
                id="base-url-input"
                type="url"
                value={authConfig.baseUrl ?? ''}
                onChange={(e) => setAuthConfig((c) => ({ ...c, baseUrl: e.target.value }))}
                placeholder="https://api.yoursystem.com"
                style={inputStyle}
                aria-required="true"
              />
            </div>

            {(authType === 'API_Key') && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <label htmlFor="api-key-input" style={labelStyle}>API Key</label>
                {/* Credential — masked, component state only, never persisted */}
                <input
                  id="api-key-input"
                  type="password"
                  autoComplete="off"
                  value={authConfig.apiKey ?? ''}
                  onChange={(e) => setAuthConfig((c) => ({ ...c, apiKey: e.target.value }))}
                  style={inputStyle}
                  aria-required="true"
                />
              </div>
            )}

            {(authType === 'Bearer_Token') && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <label htmlFor="bearer-token-input" style={labelStyle}>Bearer Token</label>
                <input
                  id="bearer-token-input"
                  type="password"
                  autoComplete="off"
                  value={authConfig.bearerToken ?? ''}
                  onChange={(e) => setAuthConfig((c) => ({ ...c, bearerToken: e.target.value }))}
                  style={inputStyle}
                  aria-required="true"
                />
              </div>
            )}

            {authType === 'Basic_Auth' && (
              <>
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <label htmlFor="basic-user-input" style={labelStyle}>Username</label>
                  <input
                    id="basic-user-input"
                    type="text"
                    autoComplete="username"
                    value={authConfig.basicUser ?? ''}
                    onChange={(e) => setAuthConfig((c) => ({ ...c, basicUser: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <label htmlFor="basic-pass-input" style={labelStyle}>Password</label>
                  <input
                    id="basic-pass-input"
                    type="password"
                    autoComplete="current-password"
                    value={authConfig.basicPass ?? ''}
                    onChange={(e) => setAuthConfig((c) => ({ ...c, basicPass: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-6)', gap: 'var(--space-3)' }}>
              <button style={secondaryBtn} onClick={() => next('STEP_2_ACCESS_METHOD')}>← Back</button>
              <button style={primaryBtn} onClick={() => next('STEP_4_TEST')}>Next →</button>
            </div>
          </div>
        )}

        {/* ── Step 4 ── */}
        {step === 'STEP_4_TEST' && (
          <div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>
              Test connection
            </h2>
            <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', margin: '0 0 var(--space-4)' }}>
              EIP will attempt to reach the system. Your credentials are transmitted securely over HTTPS.
            </p>

            {testResult && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                  background: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${testResult.success ? 'var(--status-success)' : 'var(--status-error)'}`,
                  color: testResult.success ? 'var(--status-success)' : 'var(--status-error)',
                  fontSize: 'var(--font-l5-size)',
                }}
              >
                {testResult.success ? '✓ Connected' : `✗ ${testResult.message}`}
                {testResult.latencyMs != null && ` — ${testResult.latencyMs} ms`}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button style={secondaryBtn} onClick={() => next('STEP_3_AUTH')}>← Back</button>
              <button
                style={secondaryBtn}
                onClick={runTest}
                disabled={testing}
                aria-busy={testing}
              >
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              <button
                style={primaryBtn}
                disabled={!testResult?.success}
                onClick={() => { runDiscovery(); }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5 ── */}
        {step === 'STEP_5_DISCOVERY' && (
          <div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>Discovery preview</h2>
            <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)' }}>
              {discoverySnapshot
                ? 'Discovery complete. Review the available entities below.'
                : 'Running discovery…'}
            </p>
            {discoverySnapshot != null && (
              <pre style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', overflow: 'auto', maxHeight: 200 }}>
                {JSON.stringify(discoverySnapshot, null, 2)}
              </pre>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-6)', gap: 'var(--space-3)' }}>
              <button style={secondaryBtn} onClick={() => next('STEP_4_TEST')}>← Back</button>
              <button style={primaryBtn} onClick={() => next('STEP_6_MAPPING')}>Next →</button>
            </div>
          </div>
        )}

        {/* ── Step 6 ── */}
        {step === 'STEP_6_MAPPING' && (
          <div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>Field mapping review</h2>
            <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)' }}>
              Field mapping configuration will be reviewed with your Platform Admin after submission.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-6)', gap: 'var(--space-3)' }}>
              <button style={secondaryBtn} onClick={() => next('STEP_5_DISCOVERY')}>← Back</button>
              <button style={primaryBtn} onClick={() => next('STEP_7_CAPABILITIES')}>Next →</button>
            </div>
          </div>
        )}

        {/* ── Step 7 ── */}
        {step === 'STEP_7_CAPABILITIES' && (
          <div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>Capabilities selection</h2>
            <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', margin: '0 0 var(--space-4)' }}>
              Which operations should this connector perform?
            </p>
            {['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'REPORT', 'WEBHOOK'].map((cap) => (
              <label key={cap} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-l4-size)', color: 'var(--brand-text)' }}>
                <input
                  type="checkbox"
                  checked={capabilities.includes(cap)}
                  onChange={(e) =>
                    setCapabilities((prev) =>
                      e.target.checked ? [...prev, cap] : prev.filter((c) => c !== cap),
                    )
                  }
                  aria-label={`${cap} capability`}
                />
                {cap}
              </label>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-6)', gap: 'var(--space-3)' }}>
              <button style={secondaryBtn} onClick={() => next('STEP_6_MAPPING')}>← Back</button>
              <button style={primaryBtn} onClick={() => next('STEP_8_ENABLE')}>Next →</button>
            </div>
          </div>
        )}

        {/* ── Step 8 ── */}
        {step === 'STEP_8_ENABLE' && (
          <div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>Submit integration request</h2>
            <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', margin: '0 0 var(--space-4)' }}>
              Your Platform Admin will review this request and enable the connector.
            </p>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label htmlFor="justification-input" style={labelStyle}>Business justification (optional)</label>
              <textarea
                id="justification-input"
                value={businessJustification}
                onChange={(e) => setBusinessJustification(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Why does your business need this integration?"
              />
            </div>
            <div style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', marginBottom: 'var(--space-4)', padding: 'var(--space-3)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
              <strong>Summary:</strong> {systemType} via {accessMethod} — {capabilities.join(', ') || 'No capabilities selected'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button style={secondaryBtn} onClick={() => next('STEP_6_MAPPING')}>← Back</button>
              <button style={primaryBtn} disabled={submitting} aria-busy={submitting} onClick={submit}>
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>
        )}

        {/* ── Submitted ── */}
        {step === 'SUBMITTED' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-4)' }}>✅</div>
            <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-2)' }}>Request submitted</h2>
            <p style={{ fontSize: 'var(--font-l4-size)', color: 'var(--brand-text-muted)', margin: '0 0 var(--space-6)' }}>
              Your Platform Admin has been notified and will review the integration request.
            </p>
            {onClose && <button style={primaryBtn} onClick={onClose}>Close</button>}
          </div>
        )}
      </div>
    </div>
  );
}
