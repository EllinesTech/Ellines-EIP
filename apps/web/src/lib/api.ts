const API_URL = (() => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Production static site talks to same-origin Cloudflare Pages Functions.
  if (process.env.NODE_ENV === 'production') {
    return '';
  }
  return 'http://localhost:3001';
})();

const AUTH_KEY = 'eip_auth';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  title?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  organizationId: string;
  role: string;
  isActive: boolean;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface OrgMembership {
  id: string;
  name: string;
  slug: string;
  role: string;
  isPrimary: boolean;
  parentOrgId: string | null;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: string;
  user: AuthUser;
  organization: AuthOrganization;
  isPlatformAdmin?: boolean;
  /** v1.1 — all orgs this user belongs to; populated after listMyOrgs() */
  orgs?: OrgMembership[];
}

export interface OrgMember {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  userCount: number;
  status: string;
}

export interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  note: string;
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

export function getToken(): string | null {
  return getSession()?.accessToken ?? null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { message?: string | string[] }).message ||
      `Request failed (${res.status})`;
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }
  return data as T;
}

export function login(email: string, password: string) {
  return request<AuthSession>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(payload: {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
}) {
  return request<AuthSession>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchMe() {
  return request<{
    user: AuthUser;
    organization: AuthOrganization;
    isPlatformAdmin?: boolean;
  }>('/api/v1/auth/me');
}

export function updateMyProfile(payload: {
  fullName?: string;
  title?: string;
  bio?: string;
  avatarUrl?: string;
}) {
  return request<{
    user: AuthUser;
    organization: AuthOrganization;
    isPlatformAdmin?: boolean;
  }>('/api/v1/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export const PROFILE_UPDATED_EVENT = 'eip-profile-updated';

export function applyProfileToSession(user: AuthUser, isPlatformAdmin?: boolean) {
  const current = getSession();
  if (!current) return null;
  const next: AuthSession = {
    ...current,
    user: { ...current.user, ...user },
    isPlatformAdmin:
      isPlatformAdmin !== undefined ? Boolean(isPlatformAdmin) : current.isPlatformAdmin,
  };
  setSession(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: next }));
  }
  return next;
}

/** Refresh session flags (e.g. isPlatformAdmin) from /auth/me without re-login. */
export async function refreshSessionFlags(): Promise<AuthSession | null> {
  const current = getSession();
  if (!current) return null;
  const me = await fetchMe();
  const next: AuthSession = {
    ...current,
    user: { ...current.user, ...me.user },
    organization: me.organization,
    isPlatformAdmin: Boolean(me.isPlatformAdmin),
  };
  setSession(next);
  return next;
}

export function forgotPassword(email: string) {
  return request<{ message: string; resetToken?: string; expiresIn?: string }>(
    '/api/v1/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  );
}

export function resetPassword(token: string, newPassword: string) {
  return request<{ message: string }>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export function acceptInvite(token: string, password: string, fullName?: string) {
  return request<AuthSession>('/api/v1/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token, password, fullName }),
  });
}

export function ssoRequest(email: string, provider?: string) {
  return request<{ message: string; ssoToken?: string; expiresIn?: string }>(
    '/api/v1/auth/sso/request',
    {
      method: 'POST',
      body: JSON.stringify({ email, provider }),
    },
  );
}

export function ssoVerify(token: string) {
  return request<AuthSession>('/api/v1/auth/sso/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function listOrgUsers() {
  return request<OrgMember[]>('/api/v1/orgs/me/users');
}

export function inviteOrgUser(payload: {
  email: string;
  fullName: string;
  role?: string;
  temporaryPassword?: string;
}) {
  return request<{ user: { id: string; email: string; fullName: string; role: string }; temporaryPassword: string }>(
    '/api/v1/orgs/me/users',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function updateOrgUser(userId: string, payload: { role?: string; isActive?: boolean }) {
  return request<OrgMember>(`/api/v1/orgs/me/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteOrgUser(userId: string) {
  return request<{ ok: boolean; id: string }>(`/api/v1/orgs/me/users/${userId}`, {
    method: 'DELETE',
  });
}

export type OrgBranch = {
  id: string;
  name: string;
  code: string | null;
  createdAt: string;
};

export type OrgDepartment = {
  id: string;
  name: string;
  branchId: string | null;
  createdAt: string;
};

export function listOrgBranches() {
  return request<OrgBranch[]>('/api/v1/orgs/me/branches');
}

export function createOrgBranch(payload: { name: string; code?: string }) {
  return request<OrgBranch>('/api/v1/orgs/me/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listOrgDepartments() {
  return request<OrgDepartment[]>('/api/v1/orgs/me/departments');
}

export function createOrgDepartment(payload: { name: string; branchId?: string }) {
  return request<OrgDepartment>('/api/v1/orgs/me/departments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type AuditLogDto = {
  id: string;
  action: string;
  resource: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

export function listOrgAuditLogs(limit = 80) {
  return request<AuditLogDto[]>(`/api/v1/orgs/me/audit-logs?limit=${limit}`);
}

export function changePassword(payload: { currentPassword: string; newPassword: string }) {
  return request<{ message: string }>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type OrgProfileDto = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export function fetchOrgProfile() {
  return request<OrgProfileDto>('/api/v1/orgs/me');
}

export function updateOrgProfile(payload: { name: string }) {
  return request<OrgProfileDto>('/api/v1/orgs/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export type OrgDateTimeSettingsDto = {
  timeFormat: '12h' | '24h';
  dateStyle: 'short' | 'medium' | 'log';
};

const DATETIME_CACHE_PREFIX = 'eip_datetime_prefs:';
export const DATETIME_PREFS_EVENT = 'eip-datetime-prefs';

export function cacheOrgDateTimeSettings(orgId: string, settings: OrgDateTimeSettingsDto) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${DATETIME_CACHE_PREFIX}${orgId}`, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(DATETIME_PREFS_EVENT, { detail: { orgId, settings } }));
}

export function readCachedOrgDateTimeSettings(orgId: string): OrgDateTimeSettingsDto | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(`${DATETIME_CACHE_PREFIX}${orgId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OrgDateTimeSettingsDto;
  } catch {
    return null;
  }
}

export function fetchOrgDateTimeSettings() {
  return request<OrgDateTimeSettingsDto>('/api/v1/orgs/me/settings');
}

export function updateOrgDateTimeSettings(payload: Partial<OrgDateTimeSettingsDto>) {
  return request<OrgDateTimeSettingsDto>('/api/v1/orgs/me/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export type EllineaMemoryNoteDto = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export function fetchEllineaMemory() {
  return request<EllineaMemoryNoteDto[]>('/api/v1/orgs/me/ellinea-memory');
}

export function saveEllineaMemory(notes: EllineaMemoryNoteDto[]) {
  return request<EllineaMemoryNoteDto[]>('/api/v1/orgs/me/ellinea-memory', {
    method: 'PUT',
    body: JSON.stringify(notes),
  });
}

export type EllineaAskResponse = {
  answer: string;
  mode: 'llm' | 'rag_template' | 'error';
  provider?: string;
  groundingChars?: number;
  error?: string;
};

export function askEllineaApi(payload: {
  question: string;
  summary: EnterpriseSummaryDto | null;
  memory: EllineaMemoryNoteDto[];
  templateAnswer: string;
  dna?: { summary?: string; traits?: { label?: string; detail?: string; source?: string }[] } | null;
  role?: string;
  organizationName?: string;
}) {
  return request<EllineaAskResponse>('/api/v1/ellinea/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type NotifyDeliveryPolicyDto = {
  emailDigest: boolean;
  emailAlerts: boolean;
  pushEnabled: boolean;
  digestCadence: 'daily' | 'weekly' | 'off';
};

export function fetchNotifyDeliveryPolicy() {
  return request<NotifyDeliveryPolicyDto>('/api/v1/orgs/me/notify-policy');
}

export function saveNotifyDeliveryPolicy(policy: NotifyDeliveryPolicyDto) {
  return request<NotifyDeliveryPolicyDto>('/api/v1/orgs/me/notify-policy', {
    method: 'PUT',
    body: JSON.stringify(policy),
  });
}

export type NotifyOutboxItemDto = {
  id: string;
  channel: 'email' | 'push' | 'in_app';
  subject: string;
  body: string;
  eventType: string;
  status: 'queued' | 'simulated' | 'skipped' | 'delivered' | 'failed';
  at: string;
  to?: string;
  provider?: 'resend' | 'smtp' | 'vapid' | 'none';
  detail?: string;
  message?: string;
};

export function listNotifyOutbox() {
  return request<NotifyOutboxItemDto[]>('/api/v1/notifications/deliver');
}

export function deliverNotification(payload: {
  channel?: 'email' | 'push' | 'in_app';
  subject: string;
  body: string;
  eventType?: string;
  to?: string;
}) {
  return request<NotifyOutboxItemDto>('/api/v1/notifications/deliver', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type PushSubscriptionStatusDto = {
  vapidConfigured: boolean;
  vapidPublicKey: string | null;
  subscribed: boolean;
  endpointHost: string | null;
};

export function fetchPushSubscriptionStatus() {
  return request<PushSubscriptionStatusDto>('/api/v1/notifications/push-subscription');
}

export function savePushSubscription(subscription: {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}) {
  return request<PushSubscriptionStatusDto>('/api/v1/notifications/push-subscription', {
    method: 'PUT',
    body: JSON.stringify(subscription),
  });
}

export function deletePushSubscription() {
  return request<PushSubscriptionStatusDto>('/api/v1/notifications/push-subscription', {
    method: 'DELETE',
  });
}

export function fetchPlatformOrgDateTimeSettings(orgId: string) {
  return request<OrgDateTimeSettingsDto>(`/api/v1/platform/orgs/${orgId}/settings`);
}

export function updatePlatformOrgDateTimeSettings(
  orgId: string,
  payload: Partial<OrgDateTimeSettingsDto>,
) {
  return request<OrgDateTimeSettingsDto>(`/api/v1/platform/orgs/${orgId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listPlatformOrgs() {
  return request<PlatformOrg[]>('/api/v1/platform/orgs');
}

export function updatePlatformOrgStatus(orgId: string, status: 'active' | 'suspended') {
  return request<PlatformOrg>(`/api/v1/platform/orgs/${orgId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function listPlatformFlags() {
  return request<FeatureFlag[]>('/api/v1/platform/flags');
}

export interface EnterpriseSummaryDto {
  organizationId: string;
  connectorId: string;
  connectorName: string;
  healthScore: number;
  connectedSystems: number;
  openAlerts: number;
  openDecisions: number;
  briefHighlight: string;
  timeline: { title: string; detail: string }[];
  model?: {
    version: '1.0';
    sourceSystem?: string;
    capabilities: string[];
    counts: {
      branches: number;
      departments: number;
      people: number;
      documents: number;
      assets: number;
      tasks: number;
      notifications: number;
      events: number;
    };
    objects: {
      id: string;
      kind: string;
      name: string;
      status?: string;
      branchId?: string;
    }[];
  } | null;
  syncedAt: string | null;
  status: 'idle' | 'synced' | 'error';
}

export interface ConnectorStatusDto {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'synced' | 'error';
  lastSyncedAt: string | null;
  message?: string;
}

export interface ConnectorInstallConfigDto {
  endpoint?: string;
  headers?: Record<string, string>;
  authType?: 'none' | 'apiKey' | 'bearer' | 'basic';
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  csvText?: string;
  openApiDocument?: unknown;
  openApiBaseUrl?: string;
  selectedRoutes?: { method: string; path: string; capability?: string }[];
  connectionString?: string;
  sql?: string;
  systemName?: string;
  fieldMap?: Record<string, string>;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPassword?: string;
  imapMailbox?: string;
  imapSecure?: boolean;
  sftpHost?: string;
  sftpPort?: number;
  sftpUsername?: string;
  sftpPassword?: string;
  sftpPrivateKey?: string;
  sftpRemotePath?: string;
  syncIntervalMinutes?: number;
  nextSyncAt?: string;
}

export interface ConnectorInstallationDto {
  id: string;
  organizationId: string;
  catalogId: string;
  displayName: string;
  status: string;
  lastTestAt: string | null;
  lastSyncedAt: string | null;
  lastMessage?: string | null;
  packId?: string | null;
  config: ConnectorInstallConfigDto;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorPackDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  catalogId: string;
  templateConfig: ConnectorInstallConfigDto;
  published: boolean;
  createdByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpenApiParseResult {
  title: string;
  version: string;
  baseUrl: string;
  endpoints: {
    method: string;
    path: string;
    operationId: string;
    summary: string;
    capability: string;
    selectable: boolean;
  }[];
}

export function fetchEnterpriseSummary() {
  return request<EnterpriseSummaryDto>('/api/v1/enterprise/summary');
}

/** Owner/IT: push any System B JSON (UEM / metrics) into the org snapshot. */
export function ingestEnterpriseSnapshot(payload: Record<string, unknown>) {
  return request<EnterpriseSummaryDto & { message?: string }>('/api/v1/enterprise/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type WebhookSecretDto = {
  configured: boolean;
  secretPreview: string | null;
  organizationId: string;
  endpoint: string;
  secret?: string;
  message?: string;
  headers?: Record<string, string>;
};

/** Owner/IT: masked webhook secret + endpoint for System B pushes. */
export function fetchWebhookSecret() {
  return request<WebhookSecretDto>('/api/v1/orgs/me/webhook-secret');
}

/** Owner/IT: rotate webhook secret (full value returned once). */
export function rotateWebhookSecret() {
  return request<WebhookSecretDto>('/api/v1/orgs/me/webhook-secret', {
    method: 'POST',
    body: '{}',
  });
}

// ─── Webhook Delivery (B.3.4) ─────────────────────────────────────────────

export type WebhookDeliveryStatus = 'success' | 'failure' | 'pending' | 'permanently_failed';

export type WebhookDeliveryDto = {
  id: string;
  webhookId: string;
  webhookUrl: string;
  event: string;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  latencyMs: number | null;
  attempt: number;
  nextRetryAt: string | null;
  error: string | null;
  deliveredAt: string;
};

export type WebhookDeliveryListDto = {
  deliveries: WebhookDeliveryDto[];
  total: number;
  successCount: number;
  failureCount: number;
  limit: number;
};

export type WebhookTestResultDto = {
  deliveryId: string;
  webhookUrl: string;
  event: string;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  responseBody: string | null;
  error: string | null;
  deliveredAt: string;
  signature: string | null;
  message: string;
};

export type WebhookRetryResultDto = {
  deliveryId: string;
  webhookUrl: string;
  event: string;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  attempt: number;
  nextRetryAt: string | null;
  error: string | null;
  deliveredAt: string;
  message: string;
};

/** Owner/IT: list webhook delivery logs. */
export function listWebhookDeliveries(opts?: { limit?: number; status?: string }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.status) params.set('status', opts.status);
  const qs = params.toString();
  return request<WebhookDeliveryListDto>(
    `/api/v1/orgs/me/webhook-deliveries${qs ? `?${qs}` : ''}`,
  );
}

/** Owner/IT: send a test webhook delivery to a URL. */
export function testWebhookDelivery(payload: {
  url: string;
  secret?: string;
  event?: string;
}) {
  return request<WebhookTestResultDto>('/api/v1/orgs/me/webhook-test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Owner/IT: retry a failed webhook delivery by ID. */
export function retryWebhookDelivery(deliveryId: string) {
  return request<WebhookRetryResultDto>('/api/v1/orgs/me/webhook-retry', {
    method: 'POST',
    body: JSON.stringify({ deliveryId }),
  });
}

// ─── Database Configuration (Multi-database Support) ──────────────────────

export type DatabaseConfigurationDto = {
  id: string;
  organizationId: string;
  name: string;
  type: 'local' | 'supabase' | 'custom_postgres';
  host?: string;
  port: number;
  username?: string;
  passwordEncrypted?: string;
  databaseName?: string;
  supabaseUrl?: string;
  supabaseKeyEncrypted?: string;
  sslMode: string;
  isPrimary: boolean;
  isActive: boolean;
  testStatus: 'untested' | 'success' | 'failed';
  testMessage?: string;
  lastTestedAt?: string;
  enableAutoSync: boolean;
  syncDirection: string;
  lastSyncAt?: string;
  syncStatus?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TestConnectionRequest = {
  type: 'local' | 'supabase' | 'custom_postgres';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  databaseName?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  sslMode?: string;
};

export type TestConnectionResponse = {
  success?: boolean;
  message: string;
  canTest?: boolean;
  advice?: string;
  suggestion?: string;
  note?: string;
};

/** Owner/IT: list all database configurations for organization */
export function listDatabaseConfigurations() {
  return request<DatabaseConfigurationDto[]>('/api/v1/orgs/me/database-config');
}

/** Owner/IT: create new database configuration */
export function createDatabaseConfiguration(config: Omit<DatabaseConfigurationDto, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'updatedAt'>) {
  return request<DatabaseConfigurationDto>('/api/v1/orgs/me/database-config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

/** Owner/IT: test database connection */
export function testDatabaseConnection(config: TestConnectionRequest) {
  return request<TestConnectionResponse>('/api/v1/orgs/me/database-config/test-connection', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

/** Owner/IT: switch primary database */
export function switchPrimaryDatabase(configId: string, reason?: string) {
  return request<{ success: boolean; message: string; configId: string; previousConfigId?: string }>(
    '/api/v1/orgs/me/database-config/switch-primary',
    {
      method: 'POST',
      body: JSON.stringify({ configId, reason }),
    },
  );
}

export type EllineaLearningDto = {
  feedback: Record<string, { helpful: number; dismiss: number }>;
  dna: {
    organizationId: string;
    updatedAt: string;
    traits: { id: string; label: string; detail: string; source: string }[];
    summary: string;
  } | null;
};

export function fetchEllineaLearning() {
  return request<EllineaLearningDto>('/api/v1/orgs/me/ellinea-learning');
}

export function saveEllineaLearning(payload: EllineaLearningDto) {
  return request<EllineaLearningDto>('/api/v1/orgs/me/ellinea-learning', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}



export function listConnectors() {
  return request<ConnectorStatusDto[]>('/api/v1/connectors');
}

export function syncConnector(
  connectorId: string,
  options?: ConnectorInstallConfigDto,
) {
  return request<EnterpriseSummaryDto>(`/api/v1/connectors/${connectorId}/sync`, {
    method: 'POST',
    body: options ? JSON.stringify(options) : undefined,
  });
}

export function listInstallations() {
  return request<ConnectorInstallationDto[]>('/api/v1/connectors/installations');
}

export function createInstallation(body: {
  catalogId: string;
  displayName: string;
  config?: ConnectorInstallConfigDto;
  packId?: string;
}) {
  return request<ConnectorInstallationDto>('/api/v1/connectors/installations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateInstallation(
  id: string,
  body: { displayName?: string; config?: ConnectorInstallConfigDto },
) {
  return request<ConnectorInstallationDto>(`/api/v1/connectors/installations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteInstallation(id: string) {
  return request<{ ok: boolean }>(`/api/v1/connectors/installations/${id}`, {
    method: 'DELETE',
  });
}

export function testInstallation(id: string) {
  return request<{ ok: boolean; message?: string; installation: ConnectorInstallationDto }>(
    `/api/v1/connectors/installations/${id}/test`,
    { method: 'POST' },
  );
}

export function syncInstallation(id: string) {
  return request<EnterpriseSummaryDto>(`/api/v1/connectors/installations/${id}/sync`, {
    method: 'POST',
  });
}

export function runDueConnectorSyncs() {
  return request<{
    checked: number;
    due: number;
    ran: number;
    results: { id: string; name: string; ok: boolean; message: string }[];
  }>('/api/v1/connectors/run-due', {
    method: 'POST',
  });
}

export function parseOpenApi(document: unknown) {
  return request<OpenApiParseResult>('/api/v1/connectors/openapi/parse', {
    method: 'POST',
    body: JSON.stringify({ document }),
  });
}

export type AutoscanProbeItemDto = {
  url: string;
  reachable: boolean;
  status?: number;
  title?: string;
  contentType?: string;
  server?: string;
  snippet?: string;
  error?: string;
  latencyMs?: number;
};

/** Owner/IT edge probe for public URLs IT entered (no localhost / private LAN). */
export function probeAutoscanTargets(body: {
  targets: string[];
  catalogId?: string;
  timeoutMs?: number;
}) {
  return request<{
    mode: string;
    catalogId: string | null;
    limits: { maxTargets: number; timeoutMs: number; note: string };
    results: AutoscanProbeItemDto[];
  }>('/api/v1/connectors/autoscan/probe', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listPublishedPacks() {
  return request<ConnectorPackDto[]>('/api/v1/connectors/packs');
}

export function listPlatformConnectorPacks() {
  return request<ConnectorPackDto[]>('/api/v1/platform/connector-packs');
}

export function createPlatformConnectorPack(body: {
  slug: string;
  name: string;
  description?: string;
  catalogId: string;
  templateConfig?: ConnectorInstallConfigDto;
  fromInstallationId?: string;
  published?: boolean;
}) {
  return request<ConnectorPackDto>('/api/v1/platform/connector-packs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ─── Phase 5 — Workflow & Automation API ─────────────────────────────────────

export type ApprovalStepDto = {
  key: string;
  label: string;
  status: 'pending' | 'approved' | 'rejected';
  actorRole: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
};

export type ApprovalRequestDto = {
  id: string;
  title: string;
  detail: string;
  requester: string;
  status: 'pending' | 'approved' | 'rejected';
  templateId: string;
  currentStepIndex: number;
  source: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
  createdAt: string;
  steps: ApprovalStepDto[];
};

export function listApprovals() {
  return request<ApprovalRequestDto[]>('/api/v1/orgs/me/approvals');
}

export function createApprovalApi(payload: {
  title: string;
  detail?: string;
  templateId: string;
  source?: string;
}) {
  return request<ApprovalRequestDto>('/api/v1/orgs/me/approvals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function decideApprovalApi(
  approvalId: string,
  payload: { decision: 'approved' | 'rejected'; actorName?: string; comment?: string },
) {
  return request<ApprovalRequestDto>(`/api/v1/orgs/me/approvals/${approvalId}/decide`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Email Intelligence ────────────────────────────────────────────────────────

export type EmailSyncResultDto = {
  emails: {
    id: string;
    subject: string;
    from: string;
    preview: string;
    body: string;
    at: string;
    unread: boolean;
    priority: 'high' | 'normal' | 'low';
    source: string;
    tags: string[];
  }[];
  summary: string;
  urgentCount: number;
  unreadCount: number;
  todayCount: number;
  connectors: { id: string; name: string; status: string; lastSyncedAt: string | null }[];
  syncedAt: string | null;
  pulledAt: string;
};

export function pullEmailSync() {
  return request<EmailSyncResultDto>('/api/v1/orgs/me/email-sync', {
    method: 'POST',
    body: '{}',
  });
}

// ─── Report Intelligence ──────────────────────────────────────────────────────

export type ReportInterpretResultDto = {
  interpretation: string;
  action: 'summarize' | 'pivot' | 'highlight' | 'compare';
  mode: 'llm' | 'template';
  title: string;
};

export function interpretReportApi(payload: {
  reportId?: string;
  title: string;
  content: string;
  action?: 'summarize' | 'pivot' | 'highlight' | 'compare';
  orgName?: string;
}) {
  return request<ReportInterpretResultDto>('/api/v1/orgs/me/report-interpret', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type BusinessRuleDto = {
  id: string;
  name: string;
  enabled: boolean;
  when: 'open_alerts_gte' | 'open_decisions_gte' | 'health_lt';
  threshold: number;
  then: 'seed_approval' | 'flag_overview';
  createdAt: string;
};

export function listRules() {
  return request<BusinessRuleDto[]>('/api/v1/orgs/me/rules');
}

export function createRuleApi(payload: {
  name: string;
  when: string;
  threshold: number;
  then: string;
}) {
  return request<BusinessRuleDto>('/api/v1/orgs/me/rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function toggleRuleApi(id: string, enabled: boolean) {
  return request<BusinessRuleDto>(`/api/v1/orgs/me/rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function deleteRuleApi(id: string) {
  return request<{ ok: boolean }>(`/api/v1/orgs/me/rules/${id}`, {
    method: 'DELETE',
  });
}

export type ScheduledReportDto = {
  id: string;
  title: string;
  cadence: 'daily' | 'weekly';
  template: 'executive' | 'operational' | 'department' | 'custom';
  enabled: boolean;
  lastRunAt: string | null;
  nextRunHint: string;
  createdAt: string;
  recipients?: string[];
  cc?: string[];
  bcc?: string[];
  sendHour?: number | null;
};

export type ReportDeliveryPayload = {
  title: string;
  cadence: 'daily' | 'weekly';
  template?: 'executive' | 'operational' | 'department' | 'custom';
  recipients?: string[];
  cc?: string[];
  bcc?: string[];
  sendHour?: number | null;
};

export function listReportsApi() {
  return request<ScheduledReportDto[]>('/api/v1/orgs/me/reports');
}

export function createReportApi(payload: ReportDeliveryPayload) {
  return request<ScheduledReportDto>('/api/v1/orgs/me/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runReportApi(id: string) {
  return request<ScheduledReportDto>(`/api/v1/orgs/me/reports/${id}/run`, {
    method: 'POST',
    body: '{}',
  });
}

export function toggleReportApi(id: string, enabled: boolean) {
  return request<ScheduledReportDto>(`/api/v1/orgs/me/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function updateReportDeliveryApi(
  id: string,
  payload: Partial<ReportDeliveryPayload> & { enabled?: boolean },
) {
  return request<ScheduledReportDto>(`/api/v1/orgs/me/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteReportApi(id: string) {
  return request<{ ok: boolean }>(`/api/v1/orgs/me/reports/${id}`, {
    method: 'DELETE',
  });
}

// ─── Data Export (B.3.1) ──────────────────────────────────────────────────────

export type ExportType = 'uem' | 'timeline' | 'approvals' | 'all';
export type ExportFormat = 'csv' | 'json';

/**
 * Export organization data for backup and analysis
 * Downloads as a file (CSV or JSON)
 */
export async function exportOrgData(type: ExportType, format: ExportFormat): Promise<Blob> {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const res = await fetch(
    `${API_URL}/api/v1/orgs/me/export?type=${type}&format=${format}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `Export failed (${res.status})` }));
    throw new Error(err.message || `Export failed (${res.status})`);
  }

  return res.blob();
}

// ─── Compliance Export (D.2.1) ───────────────────────────────────────────────

export type ComplianceTemplate = 'soc2' | 'hipaa' | 'gdpr' | 'pci' | 'all';

/** Owner/IT: export compliance audit report */
export async function exportComplianceReport(opts: {
  template: ComplianceTemplate;
  format: ExportFormat;
  from?: string;
  to?: string;
}): Promise<Blob> {
  const token = getToken();
  if (!token) throw new Error('Authentication required');

  const params = new URLSearchParams({
    template: opts.template,
    format: opts.format,
  });
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);

  const res = await fetch(
    `${API_URL}/api/v1/orgs/me/compliance-export?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `Compliance export failed (${res.status})` }));
    throw new Error(err.message || `Compliance export failed (${res.status})`);
  }

  return res.blob();
}

// ─── Data Access Log (D.2.2) ─────────────────────────────────────────────────

export type DataAccessResourceCategory =
  | 'connector' | 'report' | 'document' | 'export' | 'api_key'
  | 'authentication' | 'org_data' | 'other';

export type DataAccessSensitivity = 'high' | 'medium' | 'low';

export type DataAccessLogEntry = {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorEmail: string;
  actorName: string;
  action: string;
  resource: string;
  resourceCategory: DataAccessResourceCategory;
  sensitivity: DataAccessSensitivity;
  metadata: Record<string, unknown>;
};

export type DataAccessLogDto = {
  logs: DataAccessLogEntry[];
  total: number;
  fromDate: string;
  toDate: string;
  summary: {
    byCategory: Record<string, number>;
    byActor: Record<string, number>;
    highSensitivity: number;
    mediumSensitivity: number;
  };
};

/** Owner/IT: fetch structured data access log. */
export function fetchDataAccessLog(opts?: {
  limit?: number;
  resource?: string;
  userId?: string;
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.resource) params.set('resource', opts.resource);
  if (opts?.userId) params.set('userId', opts.userId);
  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);
  const qs = params.toString();
  return request<DataAccessLogDto>(`/api/v1/orgs/me/data-access-log${qs ? `?${qs}` : ''}`);
}

/** Owner/IT: download data access log as CSV. */
export async function downloadDataAccessLog(opts?: {
  resource?: string;
  from?: string;
  to?: string;
}): Promise<Blob> {
  const token = getToken();
  if (!token) throw new Error('Authentication required');
  const params = new URLSearchParams({ format: 'csv' });
  if (opts?.resource) params.set('resource', opts.resource);
  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);
  const res = await fetch(`${API_URL}/api/v1/orgs/me/data-access-log?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

// ─── Compliance Report Templates (D.2.3) ─────────────────────────────────────

export type ComplianceControlStatus = 'pass' | 'partial' | 'missing';

export type ComplianceControl = {
  id: string;
  title: string;
  description: string;
  evidenceActions: string[];
  evidenceCount: number;
  status: ComplianceControlStatus;
  lastEvidenceAt: string | null;
  remediation: string;
};

export type ComplianceReportDto = {
  template: ComplianceTemplate;
  templateTitle: string;
  organizationId: string;
  organizationName: string;
  generatedAt: string;
  periodDays: number;
  overallScore: number;
  passCount: number;
  partialCount: number;
  missingCount: number;
  controls: ComplianceControl[];
  summary: string;
};

/** Owner/IT: fetch compliance readiness report as JSON. */
export function fetchComplianceReport(template: ComplianceTemplate, periodDays = 90) {
  return request<ComplianceReportDto>(
    `/api/v1/orgs/me/compliance-report?template=${template}&periodDays=${periodDays}`,
  );
}

/** Owner/IT: download compliance report as printable HTML. */
export async function downloadComplianceReport(
  template: ComplianceTemplate,
  periodDays = 90,
): Promise<Blob> {
  const token = getToken();
  if (!token) throw new Error('Authentication required');
  const res = await fetch(
    `${API_URL}/api/v1/orgs/me/compliance-report?template=${template}&format=html&periodDays=${periodDays}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Report download failed (${res.status})`);
  return res.blob();
}

export type ReportRunHistoryDto = {
  id: string;
  reportId: string;
  reportTitle: string;
  reportTemplate: string;
  runAt: string;
  status: 'queued' | 'sent' | 'failed';
  emailStatus: string;
  recipientCount: number;
  reportChars: number;
};

export function listReportHistory(reportId?: string, limit = 50) {
  const params = new URLSearchParams();
  if (reportId) params.set('reportId', reportId);
  params.set('limit', String(limit));
  return request<ReportRunHistoryDto[]>(`/api/v1/orgs/me/reports/history?${params}`);
}

export function getReportRunContent(runId: string, format: 'text' | 'html' = 'text') {
  return request<{ content: string; format: 'text' | 'html' }>(`/api/v1/orgs/me/reports/history/${runId}?format=${format}`);
}

export function resendReportRun(runId: string, recipients?: string[]) {
  return request<{ ok: boolean; sentCount: number; emailStatus: string }>(`/api/v1/orgs/me/reports/history/${runId}/resend`, {
    method: 'POST',
    body: JSON.stringify({ recipients }),
  });
}

export type EnterpriseEventDto = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  at: string;
};

export function listEnterpriseEvents(limit = 100) {
  return request<EnterpriseEventDto[]>(`/api/v1/orgs/me/events?limit=${limit}`);
}

export function publishEnterpriseEventApi(payload: {
  type: string;
  payload?: Record<string, unknown>;
}) {
  return request<EnterpriseEventDto>('/api/v1/orgs/me/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── v1.1 — Multi-company / Multi-org ────────────────────────────────────────

/** List all organizations the current user belongs to. */
export function listMyOrgs() {
  return request<OrgMembership[]>('/api/v1/orgs/my-orgs');
}

/**
 * Switch active organization.
 * Returns a fresh AuthSession with a new JWT scoped to the target org.
 */
export function switchOrg(organizationId: string) {
  return request<AuthSession>('/api/v1/orgs/switch', {
    method: 'POST',
    body: JSON.stringify({ organizationId }),
  });
}

/**
 * Owner: create a new child organization linked to the current one.
 * The owner automatically gets an owner membership in the child.
 */
export function createChildOrg(name: string) {
  return request<{ id: string; name: string; slug: string; parentOrgId: string; createdAt: string }>(
    '/api/v1/orgs/me/create-child',
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    },
  );
}

// ─── Document Hub API ─────────────────────────────────────────────────────────

export type DocumentRecordDto = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  branch?: string;
  department?: string;
  summary?: string;
  uploadedBy: string;
  uploadedAt: string;
  content?: string; // only present on single-document GET
};

export function listDocuments() {
  return request<DocumentRecordDto[]>('/api/v1/orgs/me/documents');
}

export function uploadDocument(payload: {
  name: string;
  mimeType: string;
  content: string; // base64
  tags?: string[];
  branch?: string;
  department?: string;
  summary?: string;
}) {
  return request<DocumentRecordDto>('/api/v1/orgs/me/documents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function downloadDocument(id: string) {
  return request<DocumentRecordDto>(`/api/v1/orgs/me/documents?id=${id}`);
}

export function deleteDocument(id: string) {
  return request<{ ok: boolean }>('/api/v1/orgs/me/documents', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

// ─── Notification unread count ───────────────────────────────────────────────

export type NotifyUnreadDto = {
  unread: number;
  total: number;
};

/** Lightweight unread count — polls outbox for unread in-app items. */
export function fetchNotifyUnreadCount() {
  return request<NotifyUnreadDto>('/api/v1/notifications/deliver').then((items) => {
    // items is OutboxItem[] from the GET endpoint
    const arr = items as unknown as { status: string; channel: string }[];
    const total = arr.length;
    const unread = arr.filter(
      (i) => i.channel === 'in_app' && i.status !== 'skipped',
    ).length;
    return { unread, total } as NotifyUnreadDto;
  });
}

// ─── Reports with email status ────────────────────────────────────────────────

export type ScheduledReportRunDto = {
  id: string;
  title: string;
  cadence: 'daily' | 'weekly';
  template: 'executive' | 'operational' | 'department' | 'custom';
  enabled: boolean;
  lastRunAt: string | null;
  nextRunHint: string;
  createdAt: string;
  lastEmailStatus?: string;
  emailStatus?: string;
  reportChars?: number;
  recipients?: string[];
  cc?: string[];
  bcc?: string[];
  sendHour?: number | null;
  deliveredTo?: string[];
  deliveredCc?: string[];
  deliveredBccCount?: number;
};

export function runReportFullApi(id: string) {
  return request<ScheduledReportRunDto>(`/api/v1/orgs/me/reports/${id}/run`, {
    method: 'POST',
    body: '{}',
  });
}

// ─── Platform per-org stats ──────────────────────────────────────────────────

export type PlatformOrgStatsDto = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  lastActivityAt: string | null;
  lastSyncedAt: string | null;
  stats: {
    totalUsers: number;
    activeUsers: number;
    roleBreakdown: Record<string, number>;
    totalConnectors: number;
    syncedConnectors: number;
    totalApprovals: number;
    pendingApprovals: number;
    totalEvents: number;
  };
};

export type DashboardDto = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  layout: Record<string, any>[];
  refreshRate: number;
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  widgets?: WidgetDto[];
  exports?: DashboardExportDto[];
};

export type WidgetDto = {
  id: string;
  dashboardId: string;
  type: string;
  title: string;
  config: Record<string, any>;
  position: number;
  size: Record<string, any>;
  dataSourceId?: string;
  createdAt: string;
  updatedAt: string;
  alerts?: AlertDto[];
};

export type AlertDto = {
  id: string;
  widgetId: string;
  condition: string;
  threshold: number;
  actions: Record<string, any>[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DashboardExportDto = {
  id: string;
  dashboardId: string;
  format: string;
  schedule: string | null;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listDashboardsApi(organizationId: string) {
  return request<DashboardDto[]>('/api/v1/dashboards', {
    method: 'POST',
    body: JSON.stringify({ organizationId }),
  });
}

export function createDashboardApi(payload: {
  organizationId: string;
  name: string;
  description?: string;
  layout?: Record<string, any>[];
  refreshRate?: number;
  isPublic?: boolean;
  createdBy: string;
}) {
  return request<DashboardDto>('/api/v1/dashboards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getDashboardApi(id: string, organizationId: string) {
  return request<DashboardDto>(`/api/v1/dashboards/${id}`, {
    method: 'POST',
    body: JSON.stringify({ organizationId }),
  });
}

export function updateDashboardApi(id: string, payload: {
  organizationId: string;
  name?: string;
  description?: string;
  layout?: Record<string, any>[];
  refreshRate?: number;
  isPublic?: boolean;
}) {
  return request<DashboardDto>(`/api/v1/dashboards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteDashboardApi(id: string, organizationId: string) {
  return request<{ ok: boolean }>(`/api/v1/dashboards/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ organizationId }),
  });
}

export function addWidgetApi(dashboardId: string, payload: {
  organizationId: string;
  type: string;
  title: string;
  config?: Record<string, any>;
  position?: number;
  size?: Record<string, any>;
  dataSourceId?: string;
}) {
  return request<WidgetDto>(`/api/v1/dashboards/${dashboardId}/widgets`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateWidgetApi(dashboardId: string, widgetId: string, payload: {
  organizationId: string;
  type?: string;
  title?: string;
  config?: Record<string, any>;
  position?: number;
  size?: Record<string, any>;
}) {
  return request<WidgetDto>(`/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteWidgetApi(dashboardId: string, widgetId: string, organizationId: string) {
  return request<{ ok: boolean }>(`/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'DELETE',
    body: JSON.stringify({ organizationId }),
  });
}

export function addAlertApi(dashboardId: string, payload: {
  organizationId: string;
  widgetId: string;
  condition: string;
  threshold: number;
  actions?: Record<string, any>[];
  active?: boolean;
}) {
  return request<AlertDto>(`/api/v1/dashboards/${dashboardId}/alerts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAlertApi(dashboardId: string, alertId: string, payload: {
  organizationId: string;
  condition?: string;
  threshold?: number;
  actions?: Record<string, any>[];
  active?: boolean;
}) {
  return request<AlertDto>(`/api/v1/dashboards/${dashboardId}/alerts/${alertId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAlertApi(dashboardId: string, alertId: string, organizationId: string) {
  return request<{ ok: boolean }>(`/api/v1/dashboards/${dashboardId}/alerts/${alertId}`, {
    method: 'DELETE',
    body: JSON.stringify({ organizationId }),
  });
}

export function exportDashboardApi(dashboardId: string, payload: {
  organizationId: string;
  format: 'pdf' | 'csv' | 'excel';
  schedule?: string;
}) {
  return request<DashboardExportDto>(`/api/v1/dashboards/${dashboardId}/export`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listExportsApi(dashboardId: string, organizationId: string) {
  return request<DashboardExportDto[]>(`/api/v1/dashboards/${dashboardId}/exports?organizationId=${organizationId}`);
}

export function deleteExportApi(dashboardId: string, exportId: string, organizationId: string) {
  return request<{ ok: boolean }>(`/api/v1/dashboards/${dashboardId}/exports/${exportId}`, {
    method: 'DELETE',
    body: JSON.stringify({ organizationId }),
  });
}

export function fetchPlatformOrgStats(orgId: string) {
  return request<PlatformOrgStatsDto>(`/api/v1/platform/orgs/${orgId}/stats`);
}

// ─── v2.0 Phase A — Ellinea Agents (Autonomous AI) ──────────────────────────

export type EllineaAgentDto = {
  id: string;
  name: string;
  description: string;
  templateId: string | null;
  trigger: string;
  triggerConfig: Record<string, unknown>;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  confidenceThreshold: number;
  requireApproval: boolean;
  isActive: boolean;
  isPaused: boolean;
  executionCount: number;
  successCount: number;
  lastExecutedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function listAgents() {
  return request<EllineaAgentDto[]>('/api/v1/orgs/me/agents');
}

export function getAgent(id: string) {
  return request<EllineaAgentDto>(`/api/v1/orgs/me/agents/${id}`);
}

export function createAgent(payload: {
  name: string;
  description?: string;
  templateId?: string;
  trigger: string;
  triggerConfig?: Record<string, unknown>;
  condition?: Record<string, unknown>;
  action: Record<string, unknown>;
  confidenceThreshold?: number;
  requireApproval?: boolean;
}) {
  return request<EllineaAgentDto>('/api/v1/orgs/me/agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAgent(
  id: string,
  payload: {
    name?: string;
    description?: string;
    triggerConfig?: Record<string, unknown>;
    condition?: Record<string, unknown>;
    action?: Record<string, unknown>;
    confidenceThreshold?: number;
    requireApproval?: boolean;
    isActive?: boolean;
    isPaused?: boolean;
  },
) {
  return request<EllineaAgentDto>(`/api/v1/orgs/me/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAgent(id: string) {
  return request<{ ok: boolean }>(`/api/v1/orgs/me/agents/${id}`, {
    method: 'DELETE',
  });
}

export function executeAgent(
  id: string,
  payload?: {
    triggeredBy?: string;
    triggerPayload?: Record<string, unknown>;
    confidence?: number;
    reasoning?: Record<string, unknown>;
    recommendedAction?: string;
  },
) {
  return request<AgentExecutionDto>(`/api/v1/orgs/me/agents/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export type AgentTemplateDto = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  trigger: string;
  triggerConfig: Record<string, unknown>;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  confidenceThreshold: number;
  requireApproval: boolean;
  published: boolean;
  featured: boolean;
  installCount: number;
  installed?: boolean;
};

export function listAgentTemplates() {
  return request<AgentTemplateDto[]>('/api/v1/orgs/me/agent-templates');
}

export type AgentTriggerResultDto = {
  triggered: number;
  executions: AgentExecutionDto[];
  message?: string;
};

export type AgentWebhookSubscriptionDto = {
  id: string;
  agentId: string;
  organizationId: string;
  eventSource: string;
  eventSourceId: string | null;
  eventType: string;
  filter: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentAuditLogDto = {
  id: string;
  agentId: string;
  agentName: string;
  userId: string | null;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
};

export function triggerAgentEvent(payload: {
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  return request<AgentTriggerResultDto>('/api/v1/orgs/me/agents-trigger', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function triggerAgentWebhookEvent(payload: {
  eventSource: string;
  eventSourceId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  return request<AgentTriggerResultDto>('/api/v1/orgs/me/agents-webhook-trigger', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listAgentSubscriptions(agentId: string) {
  return request<AgentWebhookSubscriptionDto[]>(
    `/api/v1/orgs/me/agents/${agentId}/subscriptions`,
  );
}

export function subscribeAgentToEvent(
  agentId: string,
  payload: {
    eventSource: string;
    eventSourceId?: string;
    eventType: string;
    filter?: Record<string, unknown>;
  },
) {
  return request<AgentWebhookSubscriptionDto>(
    `/api/v1/orgs/me/agents/${agentId}/subscribe`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function updateAgentSubscription(
  subscriptionId: string,
  payload: {
    isActive?: boolean;
    filter?: Record<string, unknown>;
  },
) {
  return request<AgentWebhookSubscriptionDto>(
    `/api/v1/orgs/me/agents/subscriptions/${subscriptionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function unsubscribeAgent(subscriptionId: string) {
  return request<{ ok: boolean }>(
    `/api/v1/orgs/me/agents/subscriptions/${subscriptionId}`,
    {
      method: 'DELETE',
    },
  );
}

export function fetchAgentAuditLogs(agentId: string, limit = 50) {
  return request<{
    agentId: string;
    agentName: string;
    audits: AgentAuditLogDto[];
    total: number;
  }>(`/api/v1/orgs/me/agents/audit-logs?agentId=${agentId}&limit=${limit}`);
}

export function provideAgentExecutionFeedback(
  executionId: string,
  score: -1 | 0 | 1,
  comment?: string,
) {
  return request<{ ok: boolean; execution: AgentExecutionDto; message: string }>(
    `/api/v1/orgs/me/agents-executions/${executionId}/feedback`,
    {
      method: 'POST',
      body: JSON.stringify({ score, comment }),
    },
  );
}

export type AgentCohortSettingsDto = {
  optIn: boolean;
  contributeFeedback: boolean;
  drawFromCohort: boolean;
  updatedAt: string;
};

export type AgentCohortSignalDto = {
  actionType: string;
  cohortAvgScore: number;
  sampleSize: number;
  confidenceBoost: number;
};

export function fetchAgentCohortSettings() {
  return request<AgentCohortSettingsDto>('/api/v1/orgs/me/agent-cohort-settings');
}

export function updateAgentCohortSettings(payload: Partial<AgentCohortSettingsDto>) {
  return request<AgentCohortSettingsDto>('/api/v1/orgs/me/agent-cohort-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function fetchAgentCohortSignals() {
  return request<{
    enabled: boolean;
    message?: string;
    signals: AgentCohortSignalDto[];
    meta?: { totalOptedInOrgs: number; computedAt: string };
  }>('/api/v1/orgs/me/agent-cohort-signals');
}

// ─── v2.0 Phase A — Alert Correlation (A.3.1) ────────────────────────────────

export type AlertCorrelationGroupDto = {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  events: string[];
  sources: string[];
  rootCauseHint: string;
  suggestedActions: string[];
};

export function fetchAlertCorrelations() {
  return request<{
    windowHours: number;
    totalEvents: number;
    correlationGroups: AlertCorrelationGroupDto[];
    correlatedEvents: number;
    computedAt: string;
  }>('/api/v1/orgs/me/alert-correlations');
}

export function fetchAlertRootCause(
  correlationGroups: AlertCorrelationGroupDto[],
  orgName: string,
) {
  return request<{
    recommendation: string;
    mode: 'template' | 'llm';
    groupCount: number;
    computedAt: string;
  }>('/api/v1/orgs/me/alert-root-cause', {
    method: 'POST',
    body: JSON.stringify({ correlationGroups, orgName }),
  });
}


// ─── v2.0 Phase A — Ellinea Autonomous Agents ────────────────────────────────

export type AgentDto = {
  id: string;
  name: string;
  description: string;
  templateSlug: string;
  autonomyLevel: 1 | 2 | 3;
  trigger: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  confidenceThreshold: number;
  cronExpression: string | null;
  timezone: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  executionCount: number;
};

export type AgentExecutionDto = {
  id: string;
  agentId: string;
  agentName?: string;
  status: 'pending' | 'running' | 'approved' | 'rejected' | 'executed' | 'failed' | 'rolled_back';
  confidence?: number; // from trigger result
  confidenceScore?: number | null;
  requiresApproval: boolean;
  aiReasoning?: {
    confidence: number;
    reasoning: string;
    evaluatedAt: string;
  } | null;
  reasoning?: string; // from trigger result
  recommendedAction?: string; // from trigger result
  triggeredBy?: string; // from trigger result
  triggerPayload?: Record<string, unknown>;
  canRollback?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  executedAt?: string | null;
  executionResult?: Record<string, unknown> | null;
  executionError?: string | null;
  rolledBackAt?: string | null;
  rolledBackBy?: string | null;
  triggeredAt?: string;
  createdAt: string;
  updatedAt?: string;
  agent?: { name: string };
  /** Feedback (v2.0 A.2 — learning) */
  feedbackScore?: number | null; // -1, 0, or 1
  feedbackComment?: string | null;
  feedbackAt?: string | null;
  feedbackBy?: string | null;
};

export type CreateAgentPayload = {
  name: string;
  description?: string;
  templateSlug?: string;
  autonomyLevel?: 1 | 2 | 3;
  trigger?: string;
  condition?: Record<string, unknown>;
  action?: Record<string, unknown>;
  confidenceThreshold?: number;
  cronExpression?: string | null;
  timezone?: string;
  isActive?: boolean;
};

export function listAgentsApi() {
  return request<AgentDto[]>('/api/v1/orgs/me/agents');
}

export function getAgentApi(id: string) {
  return request<AgentDto>(`/api/v1/orgs/me/agents/${id}`);
}

export function createAgentApi(payload: CreateAgentPayload) {
  return request<AgentDto>('/api/v1/orgs/me/agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAgentApi(id: string, payload: Partial<CreateAgentPayload>) {
  return request<AgentDto>(`/api/v1/orgs/me/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAgentApi(id: string) {
  return request<{ ok: boolean }>(`/api/v1/orgs/me/agents/${id}`, {
    method: 'DELETE',
  });
}

export function triggerAgentApi(id: string) {
  return request<AgentExecutionDto>(`/api/v1/orgs/me/agents/${id}/trigger`, {
    method: 'POST',
    body: '{}',
  });
}

export function listAgentExecutionsApi(id: string, limit = 50) {
  return request<AgentExecutionDto[]>(`/api/v1/orgs/me/agents/${id}/executions?limit=${limit}`);
}

export function decideExecutionApi(
  agentId: string,
  execId: string,
  decision: 'approved' | 'rejected',
) {
  return request<AgentExecutionDto>(
    `/api/v1/orgs/me/agents/${agentId}/executions/${execId}/decide`,
    { method: 'POST', body: JSON.stringify({ decision }) },
  );
}

// ─── S6.2 — Invite magic link ─────────────────────────────────────────────────

export type PendingInviteDto = {
  email: string;
  fullName: string;
  role: string;
  expiresAt: string;
  invitedBy: string;
  sentAt: string;
  emailSent: boolean;
};

export type InviteResultDto = {
  ok: boolean;
  email: string;
  fullName: string;
  role: string;
  expiresAt: string;
  emailSent: boolean;
  acceptLink?: string; // only returned when no email provider configured
  _note?: string;
};

/** List pending (not yet accepted) invites for this org. */
export function listPendingInvites() {
  return request<PendingInviteDto[]>('/api/v1/orgs/me/invite');
}

/** Send a magic-link invite email. Replaces the temp-password flow. */
export function sendInvite(payload: { email: string; fullName: string; role: string }) {
  return request<InviteResultDto>('/api/v1/orgs/me/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Resend the invite (renews the token). */
export function resendInvite(payload: { email: string; fullName: string; role: string }) {
  return request<InviteResultDto>('/api/v1/orgs/me/invite-resend', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Revoke a pending invite and deactivate the placeholder account. */
export function revokeInvite(email: string) {
  return request<{ ok: boolean; message: string }>('/api/v1/orgs/me/invite', {
    method: 'DELETE',
    body: JSON.stringify({ email }),
  });
}

// ─── S6.6 — API Keys ──────────────────────────────────────────────────────────

export type ApiKeyDto = {
  id: string;
  name: string;
  keyPreview: string; // last 6 chars visible, rest masked
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

export type ApiKeyCreatedDto = ApiKeyDto & {
  key: string; // full key returned ONCE on creation
};

export function listApiKeys() {
  return request<ApiKeyDto[]>('/api/v1/orgs/me/api-keys');
}

export function createApiKey(payload: { name: string; expiresInDays?: number }) {
  return request<ApiKeyCreatedDto>('/api/v1/orgs/me/api-keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function revokeApiKey(id: string) {
  return request<{ ok: boolean }>(`/api/v1/orgs/me/api-keys/${id}`, {
    method: 'DELETE',
  });
}

// ─── Organization Data Window ─────────────────────────────────────────────────

export type OrgDataEmailDto = {
  id: string;
  subject: string;
  from: string;
  preview: string;
  at: string;
  unread: boolean;
  priority: 'high' | 'normal' | 'low';
  source: string;
  body?: string;
};

export type OrgDataReportDto = {
  id: string;
  title: string;
  source: string;
  generatedAt: string;
  format: string;
  sizeKb?: number;
  downloadUrl?: string;
  content?: string;
};

export type OrgDataWindowDto = {
  emails: OrgDataEmailDto[];
  reports: OrgDataReportDto[];
  connectors: { id: string; name: string; type: string; status: string; lastSyncedAt: string | null }[];
  syncedAt: string | null;
};

/** Aggregate emails + reports from all connected/synced systems for the Org Data Window. */
export function fetchOrgDataWindow() {
  return request<OrgDataWindowDto>('/api/v1/orgs/me/org-data-window');
}

// ─── Sprint 7 — Health + Org Status ──────────────────────────────────────────

export interface HealthDto {
  status: string;
  service: string;
  version?: string;
  ts?: string;
  timestamp?: string;
  uptimeSeconds?: number;
  email?: {
    provider: 'resend' | 'smtp' | 'none';
    live: boolean;
  };
}

/** Unauthenticated — safe to call without a token. */
export function fetchHealth() {
  return fetch(`${API_URL}/api/v1/health`)
    .then((r) => r.json() as Promise<HealthDto>)
    .catch(() => null);
}

export interface OrgStatusDto {
  connectorCount: number;
  activeConnectorCount: number;
  lastSyncedAt: string | null;
  memberCount: number;
  pendingInviteCount: number;
  hasSync: boolean;
  healthScore: number | null;
}

export function fetchOrgStatus() {
  return request<OrgStatusDto>('/api/v1/orgs/me/status');
}

// ─── Sprint 9 — Report upload + Ellinea digest ────────────────────────────────

export type ReportUploadResultDto = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  branch?: string;
  department?: string;
  summary?: string;
  ellineaSummary: string;
  mode: 'llm' | 'template';
  uploadedBy: string;
  uploadedAt: string;
};

export function uploadReport(payload: {
  name: string;
  mimeType: string;
  content: string; // base64
  textContent?: string;
  branch?: string;
  department?: string;
  tags?: string[];
}) {
  return request<ReportUploadResultDto>('/api/v1/orgs/me/report-upload', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type EllineaDigestResultDto = {
  ok: boolean;
  message: string;
  provider?: string;
};

export function sendEllineaDigest(force = false) {
  return request<EllineaDigestResultDto>('/api/v1/orgs/me/ellinea-digest', {
    method: 'POST',
    body: JSON.stringify({ force }),
  });
}

// ─── Report Comparison (S10.1) ───────────────────────────────────────────────

export type ReportCompareResultDto = {
  reportAId: string;
  reportBId: string;
  titleA: string;
  titleB: string;
  comparison: string;
  exportHtml: string;
  mode: 'llm' | 'template';
  comparedAt: string;
};

export function compareReportsApi(payload: {
  reportAId: string;
  reportBId: string;
  titleA: string;
  titleB: string;
  contentA: string;
  contentB: string;
  dateA: string;
  dateB: string;
  orgName?: string;
}) {
  return request<ReportCompareResultDto>('/api/v1/orgs/me/report-compare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Sprint 10 — Report comparison + People contact ──────────────────────────

export type ReportComparisonDto = {
  reportAId: string;
  reportBId: string;
  titleA: string;
  titleB: string;
  comparison: string;
  exportHtml: string;
  mode: 'llm' | 'template';
  comparedAt: string;
};

export function compareReports(payload: {
  reportAId: string;
  reportBId: string;
  titleA: string;
  titleB: string;
  contentA: string;
  contentB: string;
  dateA?: string;
  dateB?: string;
  orgName?: string;
}) {
  return request<ReportComparisonDto>('/api/v1/orgs/me/report-compare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
