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

export interface AuthSession {
  accessToken: string;
  expiresIn: string;
  user: AuthUser;
  organization: AuthOrganization;
  isPlatformAdmin?: boolean;
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
}) {
  return request<EllineaAskResponse>('/api/v1/ellinea/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
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
