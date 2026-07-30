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

export function listPlatformOrgs() {
  return request<PlatformOrg[]>('/api/v1/platform/orgs');
}

export function listPlatformFlags() {
  return request<FeatureFlag[]>('/api/v1/platform/flags');
}
