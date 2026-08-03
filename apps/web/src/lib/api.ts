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
  payload: { decision: 'approved' | 'rejected'; actorName?: string },
) {
  return request<ApprovalRequestDto>(`/api/v1/orgs/me/approvals/${approvalId}/decide`, {
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
  enabled: boolean;
  lastRunAt: string | null;
  nextRunHint: string;
  createdAt: string;
};

export function listReportsApi() {
  return request<ScheduledReportDto[]>('/api/v1/orgs/me/reports');
}

export function createReportApi(payload: { title: string; cadence: 'daily' | 'weekly' }) {
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

export function deleteReportApi(id: string) {
  return request<{ ok: boolean }>(`/api/v1/orgs/me/reports/${id}`, {
    method: 'DELETE',
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
  enabled: boolean;
  lastRunAt: string | null;
  nextRunHint: string;
  createdAt: string;
  lastEmailStatus?: string;
  emailStatus?: string;
  reportChars?: number;
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

export function triggerAgentEvent(payload: {
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  return request<AgentTriggerResultDto>('/api/v1/orgs/me/agents-trigger', {
    method: 'POST',
    body: JSON.stringify(payload),
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
