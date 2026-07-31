'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  createInstallation,
  deleteInstallation,
  getSession,
  listInstallations,
  listPublishedPacks,
  parseOpenApi,
  syncInstallation,
  testInstallation,
  updateInstallation,
  runDueConnectorSyncs,
  ingestEnterpriseSnapshot,
  fetchWebhookSecret,
  rotateWebhookSecret,
  type ConnectorInstallConfigDto,
  type ConnectorInstallationDto,
  type ConnectorPackDto,
  type OpenApiParseResult,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

const DEFAULT_CSV = `metric,value
healthScore,81
connectedSystems,4
openAlerts,1
openDecisions,3
briefHighlight,"Branch ops CSV export — no vendor API; file landed from nightly ERP dump."
`;

const DEFAULT_SQL = `SELECT
  72 AS "healthScore",
  1 AS "connectedSystems",
  2 AS "openAlerts",
  1 AS "openDecisions",
  'Read-only SQL from reporting replica — no vendor API.' AS "briefHighlight"`;

type WizardStep = 1 | 2 | 3 | 4;

const TYPES = [
  {
    id: 'openapi',
    title: 'OpenAPI / Swagger',
    tag: 'Best when docs exist',
    blurb: 'Upload the vendor OpenAPI file. EIP lists capabilities — no vendor developer.',
  },
  {
    id: 'rest-api',
    title: 'REST / HTTP API',
    tag: 'When API exists',
    blurb: 'Point at any JSON HTTPS URL IT can reach.',
  },
  {
    id: 'postgres',
    title: 'PostgreSQL (read-only)',
    tag: 'No API needed',
    blurb: 'Connect to a reporting DB / replica when the vendor will not ship an API.',
  },
  {
    id: 'sqlserver',
    title: 'SQL Server (read-only)',
    tag: 'No API needed',
    blurb: 'T-SQL reporting DB for on-prem ERPs and HIS backends.',
  },
  {
    id: 'mysql',
    title: 'MySQL (read-only)',
    tag: 'No API needed',
    blurb: 'MySQL reporting DB when the vendor will not ship an API.',
  },
  {
    id: 'csv-file',
    title: 'CSV / File export',
    tag: 'No API needed',
    blurb: 'Paste a nightly CSV/Excel dump the business already produces.',
  },
  {
    id: 'email-imap',
    title: 'Email (IMAP)',
    tag: 'Legacy reports',
    blurb: 'Ingest mailed reports and alerts from the prime system.',
  },
  {
    id: 'sftp',
    title: 'SFTP / folder drop',
    tag: 'Healthcare / supply chain',
    blurb: 'Pull CSV dumps from an SFTP inbox the HIS or ERP already fills.',
  },
  {
    id: 'demo-json',
    title: 'Demo JSON seed',
    tag: 'Smoke test only',
    blurb: 'Built-in sample — not for production. Prefer a real system path above.',
  },
] as const;

export default function ConnectorsPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [installations, setInstallations] = useState<ConnectorInstallationDto[]>([]);
  const [packs, setPacks] = useState<ConnectorPackDto[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [catalogId, setCatalogId] = useState<string>('openapi');
  const [displayName, setDisplayName] = useState('');
  const [packId, setPackId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [endpoint, setEndpoint] = useState('/api/v1/connectors/rest-sample');
  const [authType, setAuthType] = useState<ConnectorInstallConfigDto['authType']>('none');
  const [apiKey, setApiKey] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [basicUser, setBasicUser] = useState('');
  const [basicPass, setBasicPass] = useState('');
  const [csvText, setCsvText] = useState(DEFAULT_CSV);
  const [connectionString, setConnectionString] = useState('');
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapUser, setImapUser] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [imapMailbox, setImapMailbox] = useState('INBOX');
  const [sftpHost, setSftpHost] = useState('');
  const [sftpPort, setSftpPort] = useState('22');
  const [sftpUsername, setSftpUsername] = useState('');
  const [sftpPassword, setSftpPassword] = useState('');
  const [sftpRemotePath, setSftpRemotePath] = useState('');
  const [openApiText, setOpenApiText] = useState('');
  const [openApiBaseUrl, setOpenApiBaseUrl] = useState('');
  const [parsed, setParsed] = useState<OpenApiParseResult | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(0);
  const [byoJson, setByoJson] = useState(
    '{\n  "connectorName": "External System B",\n  "healthScore": 78,\n  "connectedSystems": 1,\n  "openAlerts": 2,\n  "openDecisions": 1,\n  "briefHighlight": "Pushed from an external UEM feed.",\n  "timeline": [{ "title": "External ingest", "detail": "BYO snapshot" }]\n}',
  );
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [webhookPreview, setWebhookPreview] = useState<string | null>(null);
  const [webhookOrgId, setWebhookOrgId] = useState('');
  const [webhookSecretOnce, setWebhookSecretOnce] = useState<string | null>(null);

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
    setOk(true);
  }, [router]);

  async function load() {
    setError('');
    try {
      const [inst, p, wh] = await Promise.all([
        listInstallations(),
        listPublishedPacks(),
        fetchWebhookSecret().catch(() => null),
      ]);
      setInstallations(inst);
      setPacks(p);
      if (wh) {
        setWebhookConfigured(wh.configured);
        setWebhookPreview(wh.secretPreview);
        setWebhookOrgId(wh.organizationId);
      }
      try {
        const due = await runDueConnectorSyncs();
        if (due.ran > 0) {
          const okCount = due.results.filter((r) => r.ok).length;
          setNotice(
            `Scheduler ran ${due.ran} due sync${due.ran === 1 ? '' : 's'} (${okCount} ok).`,
          );
          const refreshed = await listInstallations();
          setInstallations(refreshed);
        }
      } catch {
        /* opportunistic scheduler — ignore if briefly unavailable */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connectors');
    }
  }

  useEffect(() => {
    if (!ok) return;
    void load();
  }, [ok]);

  function resetWizard() {
    setStep(1);
    setCatalogId('openapi');
    setDisplayName('');
    setPackId('');
    setEditingId(null);
    setEndpoint('/api/v1/connectors/rest-sample');
    setAuthType('none');
    setApiKey('');
    setBearerToken('');
    setBasicUser('');
    setBasicPass('');
    setCsvText(DEFAULT_CSV);
    setConnectionString('');
    setSql(DEFAULT_SQL);
    setOpenApiText('');
    setOpenApiBaseUrl('');
    setParsed(null);
    setSelectedPaths([]);
    setTestOk(null);
    setSyncIntervalMinutes(0);
  }

  function openWizard() {
    resetWizard();
    setWizardOpen(true);
  }

  function buildConfig(): ConnectorInstallConfigDto {
    const config: ConnectorInstallConfigDto = {
      authType,
      systemName: displayName || undefined,
    };
    if (authType === 'apiKey' && apiKey && apiKey !== '***') config.apiKey = apiKey;
    if (authType === 'bearer' && bearerToken && bearerToken !== '***') {
      config.bearerToken = bearerToken;
    }
    if (authType === 'basic') {
      if (basicUser) config.basicUser = basicUser;
      if (basicPass && basicPass !== '***') config.basicPass = basicPass;
    }
    if (catalogId === 'rest-api') config.endpoint = endpoint.trim();
    if (catalogId === 'csv-file') config.csvText = csvText;
    if (catalogId === 'postgres' || catalogId === 'sqlserver' || catalogId === 'mysql') {
      if (connectionString && connectionString !== '***') {
        config.connectionString = connectionString;
      }
      config.sql = sql;
    }
    if (catalogId === 'email-imap') {
      config.imapHost = imapHost.trim();
      config.imapPort = Number(imapPort) || 993;
      config.imapUser = imapUser.trim();
      if (imapPassword && imapPassword !== '***') config.imapPassword = imapPassword;
      config.imapMailbox = imapMailbox.trim() || 'INBOX';
      config.imapSecure = true;
    }
    if (catalogId === 'sftp') {
      config.sftpHost = sftpHost.trim();
      config.sftpPort = Number(sftpPort) || 22;
      config.sftpUsername = sftpUsername.trim();
      if (sftpPassword && sftpPassword !== '***') config.sftpPassword = sftpPassword;
      config.sftpRemotePath = sftpRemotePath.trim();
    }
    if (catalogId === 'openapi') {
      if (openApiText.trim()) {
        try {
          config.openApiDocument = JSON.parse(openApiText);
        } catch {
          /* kept as text parse failure handled later */
        }
      }
      config.openApiBaseUrl = openApiBaseUrl.trim() || parsed?.baseUrl || '';
      config.selectedRoutes = (parsed?.endpoints || [])
        .filter((e) => selectedPaths.includes(`${e.method} ${e.path}`))
        .map((e) => ({ method: e.method, path: e.path, capability: e.capability }));
    }
    config.syncIntervalMinutes = syncIntervalMinutes;
    return config;
  }

  async function onParseOpenApi() {
    setBusy(true);
    setError('');
    try {
      const doc = JSON.parse(openApiText);
      const result = await parseOpenApi(doc);
      setParsed(result);
      if (!openApiBaseUrl && result.baseUrl) setOpenApiBaseUrl(result.baseUrl);
      if (!displayName) setDisplayName(result.title);
      const defaults = result.endpoints
        .filter((e) => e.selectable)
        .slice(0, 5)
        .map((e) => `${e.method} ${e.path}`);
      setSelectedPaths(defaults);
      setNotice(`Parsed ${result.endpoints.length} operations from ${result.title}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OpenAPI parse failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(): Promise<string> {
    const config = buildConfig();
    if (catalogId === 'openapi' && openApiText.trim() && !config.openApiDocument) {
      throw new Error('OpenAPI JSON is invalid');
    }
    const name =
      displayName.trim() ||
      TYPES.find((t) => t.id === catalogId)?.title ||
      catalogId;

    if (editingId) {
      await updateInstallation(editingId, { displayName: name, config });
      return editingId;
    }

    const created = await createInstallation({
      catalogId,
      displayName: name,
      config,
      packId: packId || undefined,
    });
    setEditingId(created.id);
    return created.id;
  }

  async function onTest() {
    setBusy(true);
    setError('');
    setNotice('');
    setTestOk(null);
    try {
      const id = await saveDraft();
      const result = await testInstallation(id);
      setTestOk(result.ok);
      setNotice(result.message || (result.ok ? 'Connection test OK' : 'Test failed'));
      if (result.ok) setStep(4);
      await load();
    } catch (err) {
      setTestOk(false);
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  async function onSyncInstall(id?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const installId = id || (await saveDraft());
      const summary = await syncInstallation(installId);
      setNotice(
        `Synced ${summary.connectorName}: health ${summary.healthScore}, ${summary.connectedSystems} systems.`,
      );
      setWizardOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Remove this connector installation?')) return;
    setBusy(true);
    try {
      await deleteInstallation(id);
      setNotice('Installation removed.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  function editInstallation(inst: ConnectorInstallationDto) {
    resetWizard();
    setEditingId(inst.id);
    setCatalogId(inst.catalogId);
    setDisplayName(inst.displayName);
    setPackId(inst.packId || '');
    const c = inst.config || {};
    if (c.endpoint) setEndpoint(String(c.endpoint));
    if (c.authType) setAuthType(c.authType);
    if (c.apiKey) setApiKey(String(c.apiKey));
    if (c.bearerToken) setBearerToken(String(c.bearerToken));
    if (c.basicUser) setBasicUser(String(c.basicUser));
    if (c.basicPass) setBasicPass(String(c.basicPass));
    if (c.csvText) setCsvText(String(c.csvText));
    if (c.connectionString) setConnectionString(String(c.connectionString));
    if (c.sql) setSql(String(c.sql));
    if (c.openApiBaseUrl) setOpenApiBaseUrl(String(c.openApiBaseUrl));
    if (c.selectedRoutes?.length) {
      setSelectedPaths(c.selectedRoutes.map((r) => `${r.method} ${r.path}`));
    }
    setSyncIntervalMinutes(Number(c.syncIntervalMinutes) || 0);
    setStep(2);
    setWizardOpen(true);
  }

  async function installFromPack(pack: ConnectorPackDto) {
    resetWizard();
    setCatalogId(pack.catalogId);
    setDisplayName(pack.name);
    setPackId(pack.id);
    const c = pack.templateConfig || {};
    if (c.endpoint) setEndpoint(String(c.endpoint));
    if (c.sql) setSql(String(c.sql));
    if (c.openApiBaseUrl) setOpenApiBaseUrl(String(c.openApiBaseUrl));
    setStep(2);
    setWizardOpen(true);
    setNotice(`Installing pack “${pack.name}” — enter credentials, then Test & Sync.`);
  }

  if (!ok) {
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
          <p className={styles.eyebrow}>Integration Hub · Owner / IT</p>
          <h1>Connectors</h1>
          <p className={styles.lede}>
            Connect System B (HIS, ERP, CRM…) so Owner, IT, and employees can see and act on what that
            system can do. Set sync schedules per install; due syncs run when IT opens this page.
          </p>
        </div>
        <button type="button" className={adminStyles.primary} onClick={openWizard} disabled={busy}>
          Install connector
        </button>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={styles.brief} style={{ marginBottom: '1.1rem' }}>
        <div className={styles.panelLabel}>Bring-your-own System B</div>
        <p className={styles.lede}>
          Paste any UEM / metrics JSON and ingest it as this org’s enterprise snapshot (no vendor
          connector required). API: <code>POST /api/v1/enterprise/ingest</code>.
        </p>
        <label className={adminStyles.form} style={{ display: 'block' }}>
          <span className={styles.panelLabel}>JSON payload</span>
          <textarea
            value={byoJson}
            onChange={(e) => setByoJson(e.target.value)}
            rows={8}
            style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}
          />
        </label>
        <button
          type="button"
          className={adminStyles.primary}
          disabled={busy}
          style={{ marginTop: '0.5rem' }}
          onClick={() => {
            setBusy(true);
            setError('');
            try {
              const parsedJson = JSON.parse(byoJson) as Record<string, unknown>;
              void ingestEnterpriseSnapshot(parsedJson)
                .then((res) => {
                  setNotice(res.message || `Ingested · health ${res.healthScore}`);
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : 'Ingest failed');
                })
                .finally(() => setBusy(false));
            } catch {
              setBusy(false);
              setError('BYO JSON is invalid');
            }
          }}
        >
          Ingest external snapshot
        </button>
      </section>

      <section className={styles.brief} style={{ marginBottom: '1.1rem' }}>
        <div className={styles.panelLabel}>Webhooks / events</div>
        <p className={styles.lede}>
          System B can push UEM JSON to <code>POST /api/v1/webhooks/enterprise</code> (no polling).
          Auth with headers <code>X-EIP-Organization-Id</code> + <code>X-EIP-Webhook-Secret</code>, or
          Owner/IT Bearer JWT.
        </p>
        <p className={styles.lede}>
          {webhookConfigured
            ? `Secret configured · ${webhookPreview || '••••'}`
            : 'No webhook secret yet — rotate to create one.'}
          {webhookOrgId ? (
            <>
              {' '}
              · Org <code>{webhookOrgId}</code>
            </>
          ) : null}
        </p>
        {webhookSecretOnce ? (
          <p className={adminStyles.notice}>
            New secret (copy now): <code>{webhookSecretOnce}</code>
          </p>
        ) : null}
        <button
          type="button"
          className={adminStyles.primary}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            setWebhookSecretOnce(null);
            void rotateWebhookSecret()
              .then((res) => {
                setWebhookConfigured(true);
                setWebhookPreview(res.secretPreview);
                setWebhookOrgId(res.organizationId);
                setWebhookSecretOnce(res.secret || null);
                setNotice(res.message || 'Webhook secret rotated');
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : 'Rotate failed');
              })
              .finally(() => setBusy(false));
          }}
        >
          {webhookConfigured ? 'Rotate webhook secret' : 'Create webhook secret'}
        </button>
      </section>

      {packs.length > 0 ? (
        <section className={styles.brief} style={{ marginBottom: '1.1rem' }}>
          <div className={styles.panelLabel}>Platform packs (credentials only)</div>
          <div className={adminStyles.packGrid}>
            {packs.map((p) => (
              <article key={p.id} className={adminStyles.packCard}>
                <strong>{p.name}</strong>
                <p>{p.description || p.catalogId}</p>
                <button
                  type="button"
                  className={adminStyles.ghost}
                  disabled={busy}
                  onClick={() => void installFromPack(p)}
                >
                  Install pack
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {wizardOpen ? (
        <section className={adminStyles.wizard}>
          <div className={adminStyles.wizardHead}>
            <div className={styles.panelLabel}>
              Install wizard · Step {step} of 4
              {editingId ? ' · editing' : ''}
            </div>
            <button type="button" className={adminStyles.ghost} onClick={() => setWizardOpen(false)}>
              Close
            </button>
          </div>

          <div className={adminStyles.steps}>
            {(['Type', 'Credentials', 'Map / capabilities', 'Test & sync'] as const).map((label, i) => (
              <span
                key={label}
                className={step === i + 1 ? adminStyles.stepActive : adminStyles.step}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>

          {step === 1 ? (
            <div className={adminStyles.typeGrid}>
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={
                    catalogId === t.id ? adminStyles.typeCardActive : adminStyles.typeCard
                  }
                  onClick={() => {
                    setCatalogId(t.id);
                    if (!displayName) setDisplayName(t.title);
                  }}
                >
                  <span className={adminStyles.typeTag}>{t.tag}</span>
                  <strong>{t.title}</strong>
                  <p>{t.blurb}</p>
                </button>
              ))}
              <div className={adminStyles.form} style={{ gridColumn: '1 / -1' }}>
                <label>
                  Display name
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Hospidia production"
                  />
                </label>
              </div>
              <button
                type="button"
                className={adminStyles.primary}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className={adminStyles.form}>
                {(catalogId === 'rest-api' || catalogId === 'openapi') && (
                  <>
                    <label>
                      Auth
                      <select
                        value={authType}
                        onChange={(e) =>
                          setAuthType(e.target.value as ConnectorInstallConfigDto['authType'])
                        }
                      >
                        <option value="none">None</option>
                        <option value="apiKey">API key</option>
                        <option value="bearer">Bearer token</option>
                        <option value="basic">Basic</option>
                      </select>
                    </label>
                    {authType === 'apiKey' ? (
                      <label>
                        API key
                        <input
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Paste key"
                        />
                      </label>
                    ) : null}
                    {authType === 'bearer' ? (
                      <label>
                        Bearer token
                        <input
                          value={bearerToken}
                          onChange={(e) => setBearerToken(e.target.value)}
                        />
                      </label>
                    ) : null}
                    {authType === 'basic' ? (
                      <>
                        <label>
                          Username
                          <input value={basicUser} onChange={(e) => setBasicUser(e.target.value)} />
                        </label>
                        <label>
                          Password
                          <input
                            type="password"
                            value={basicPass}
                            onChange={(e) => setBasicPass(e.target.value)}
                          />
                        </label>
                      </>
                    ) : null}
                  </>
                )}

                {catalogId === 'rest-api' ? (
                  <label style={{ gridColumn: '1 / -1' }}>
                    Endpoint URL
                    <input
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="https://vendor.example/api/enterprise"
                    />
                  </label>
                ) : null}

                {catalogId === 'openapi' ? (
                  <>
                    <label style={{ gridColumn: '1 / -1' }}>
                      OpenAPI / Swagger JSON
                      <textarea
                        value={openApiText}
                        onChange={(e) => setOpenApiText(e.target.value)}
                        rows={8}
                        placeholder='Paste openapi.json here'
                      />
                    </label>
                    <label style={{ gridColumn: '1 / -1' }}>
                      Base URL (override)
                      <input
                        value={openApiBaseUrl}
                        onChange={(e) => setOpenApiBaseUrl(e.target.value)}
                        placeholder="https://vendor.example/api"
                      />
                    </label>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy || !openApiText.trim()}
                      onClick={() => void onParseOpenApi()}
                    >
                      Parse capabilities
                    </button>
                  </>
                ) : null}

                {catalogId === 'csv-file' ? (
                  <label style={{ gridColumn: '1 / -1' }}>
                    CSV content
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      rows={8}
                    />
                  </label>
                ) : null}

                {catalogId === 'postgres' ||
                catalogId === 'sqlserver' ||
                catalogId === 'mysql' ? (
                  <>
                    <label style={{ gridColumn: '1 / -1' }}>
                      Connection string (read-only role)
                      <input
                        value={connectionString}
                        onChange={(e) => setConnectionString(e.target.value)}
                        placeholder={
                          catalogId === 'sqlserver'
                            ? 'Server=host,1433;Database=dbname;User Id=reader;Password=…;Encrypt=true'
                            : catalogId === 'mysql'
                              ? 'mysql://reader:…@host:3306/dbname'
                              : 'postgresql://reader:…@host:5432/dbname'
                        }
                      />
                    </label>
                    <label style={{ gridColumn: '1 / -1' }}>
                      SELECT query (metrics row or metric/value pairs)
                      <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={6} />
                    </label>
                    <p className={styles.lede}>
                      Postgres / SQL Server / MySQL / IMAP / SFTP sync runs on the Identity API
                      (TCP). On Pages-only deploys, save config here and sync via Nest Identity.
                    </p>
                  </>
                ) : null}

                {catalogId === 'email-imap' ? (
                  <>
                    <label>
                      IMAP host
                      <input
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                        placeholder="imap.vendor.com"
                      />
                    </label>
                    <label>
                      Port
                      <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} />
                    </label>
                    <label>
                      User
                      <input value={imapUser} onChange={(e) => setImapUser(e.target.value)} />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        value={imapPassword}
                        onChange={(e) => setImapPassword(e.target.value)}
                      />
                    </label>
                    <label>
                      Mailbox
                      <input
                        value={imapMailbox}
                        onChange={(e) => setImapMailbox(e.target.value)}
                        placeholder="INBOX"
                      />
                    </label>
                  </>
                ) : null}

                {catalogId === 'sftp' ? (
                  <>
                    <label>
                      SFTP host
                      <input
                        value={sftpHost}
                        onChange={(e) => setSftpHost(e.target.value)}
                        placeholder="sftp.vendor.com"
                      />
                    </label>
                    <label>
                      Port
                      <input value={sftpPort} onChange={(e) => setSftpPort(e.target.value)} />
                    </label>
                    <label>
                      Username
                      <input
                        value={sftpUsername}
                        onChange={(e) => setSftpUsername(e.target.value)}
                      />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        value={sftpPassword}
                        onChange={(e) => setSftpPassword(e.target.value)}
                      />
                    </label>
                    <label style={{ gridColumn: '1 / -1' }}>
                      Remote file path (CSV)
                      <input
                        value={sftpRemotePath}
                        onChange={(e) => setSftpRemotePath(e.target.value)}
                        placeholder="/exports/enterprise_daily.csv"
                      />
                    </label>
                  </>
                ) : null}

                {catalogId === 'demo-json' ? (
                  <p className={styles.lede}>
                    Smoke test only — prefer OpenAPI, Postgres, CSV, Email, or SFTP for real System B
                    data.
                  </p>
                ) : null}
              </div>
              <div className={adminStyles.wizardActions}>
                <button type="button" className={adminStyles.ghost} onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  type="button"
                  className={adminStyles.primary}
                  onClick={() => setStep(catalogId === 'openapi' ? 3 : 4)}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 && catalogId === 'openapi' ? (
            <div>
              {!parsed ? (
                <p className={styles.lede}>
                  Parse the OpenAPI document in step 2 to list capabilities.
                </p>
              ) : (
                <>
                  <p className={styles.lede}>
                    Select GET routes to sync ({parsed.title} v{parsed.version}). Writes stay off until
                    policy lands.
                  </p>
                  <div className={adminStyles.capList}>
                    {parsed.endpoints.map((e) => {
                      const key = `${e.method} ${e.path}`;
                      const disabled = !e.selectable;
                      const checked = selectedPaths.includes(key);
                      return (
                        <label
                          key={key}
                          className={disabled ? adminStyles.capDisabled : adminStyles.capRow}
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={checked}
                            onChange={() => {
                              setSelectedPaths((prev) =>
                                checked ? prev.filter((x) => x !== key) : [...prev, key],
                              );
                            }}
                          />
                          <span className={adminStyles.capMethod}>{e.method}</span>
                          <span>{e.capability}</span>
                          <code>{e.path}</code>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
              <div className={adminStyles.wizardActions}>
                <button type="button" className={adminStyles.ghost} onClick={() => setStep(2)}>
                  Back
                </button>
                <button type="button" className={adminStyles.primary} onClick={() => setStep(4)}>
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div>
              <p className={styles.lede}>
                Save credentials on the server, choose a sync schedule, test the connection, then sync
                into the enterprise snapshot Ellinea reads.
              </p>
              <div className={adminStyles.form} style={{ marginBottom: '0.85rem' }}>
                <label>
                  Sync schedule
                  <select
                    value={String(syncIntervalMinutes)}
                    onChange={(e) => setSyncIntervalMinutes(Number(e.target.value) || 0)}
                  >
                    <option value="0">Manual only</option>
                    <option value="15">Every 15 minutes</option>
                    <option value="60">Every hour</option>
                    <option value="360">Every 6 hours</option>
                    <option value="1440">Daily</option>
                  </select>
                </label>
              </div>
              {testOk === true ? (
                <p className={adminStyles.notice}>Last test succeeded.</p>
              ) : null}
              {testOk === false ? (
                <p className={adminStyles.error}>Last test failed — fix credentials and retry.</p>
              ) : null}
              <div className={adminStyles.wizardActions}>
                <button
                  type="button"
                  className={adminStyles.ghost}
                  onClick={() => setStep(catalogId === 'openapi' ? 3 : 2)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={adminStyles.ghost}
                  disabled={busy}
                  onClick={() => void onTest()}
                >
                  {busy ? 'Working…' : 'Test connection'}
                </button>
                <button
                  type="button"
                  className={adminStyles.primary}
                  disabled={busy}
                  onClick={() => void onSyncInstall()}
                >
                  {busy ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Installed connections</div>
        {installations.length === 0 ? (
          <p className={styles.lede}>
            No saved installations yet. Use Install connector — nothing is kept in the browser.
          </p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {installations.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div>{c.displayName}</div>
                    {c.lastMessage ? (
                      <div style={{ fontSize: '0.78rem', color: '#8b95a8', marginTop: 2 }}>
                        {c.lastMessage}
                      </div>
                    ) : null}
                  </td>
                  <td>{c.catalogId}</td>
                  <td>{c.status}</td>
                  <td>
                    <select
                      value={String(c.config?.syncIntervalMinutes || 0)}
                      disabled={busy}
                      aria-label={`Schedule for ${c.displayName}`}
                      onChange={(e) => {
                        const mins = Number(e.target.value) || 0;
                        void (async () => {
                          setBusy(true);
                          setError('');
                          try {
                            await updateInstallation(c.id, {
                              config: { syncIntervalMinutes: mins },
                            });
                            setNotice(
                              mins
                                ? `Schedule set to every ${mins} minutes for ${c.displayName}.`
                                : `Manual sync only for ${c.displayName}.`,
                            );
                            await load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Schedule update failed');
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      <option value="0">Manual</option>
                      <option value="15">15 min</option>
                      <option value="60">1 hour</option>
                      <option value="360">6 hours</option>
                      <option value="1440">Daily</option>
                    </select>
                    {c.config?.nextSyncAt ? (
                      <div style={{ fontSize: '0.72rem', color: '#8b95a8', marginTop: 4 }}>
                        Next {new Date(String(c.config.nextSyncAt)).toLocaleString()}
                      </div>
                    ) : null}
                  </td>
                  <td>{c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : '—'}</td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy}
                      onClick={() => editInstallation(c)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={adminStyles.primary}
                      disabled={busy}
                      onClick={() => void onSyncInstall(c.id)}
                    >
                      Sync
                    </button>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy}
                      onClick={() => void onDelete(c.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
