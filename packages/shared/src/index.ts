/** Ellines EIP — shared types and constants */

export type UserRole = 'owner' | 'admin' | 'executive' | 'manager' | 'member' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  code?: string;
  createdAt: string;
}

export interface Department {
  id: string;
  organizationId: string;
  branchId?: string;
  name: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export const EIP_ROLES: UserRole[] = [
  'owner',
  'admin',
  'executive',
  'manager',
  'member',
  'viewer',
];

/** Roles that can mutate org membership and structure. */
export const ORG_ADMIN_ROLES: UserRole[] = ['owner', 'admin'];

/** Roles assignable by org admins (owners may also assign `owner`). */
export const ORG_ASSIGNABLE_ROLES: UserRole[] = [
  'admin',
  'executive',
  'manager',
  'member',
  'viewer',
];

export function isOrgAdminRole(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function isWorkConsoleRole(role: string | undefined | null): boolean {
  return EIP_ROLES.includes(role as UserRole);
}

/** Parse comma-separated platform operator emails (case-insensitive). */
export function parsePlatformAdminEmails(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Platform Super Admin is not an org role — it is an Ellines operator allowlist.
 * Pass emails from PLATFORM_ADMIN_EMAILS (server) or a session flag from /auth/me.
 */
export function isPlatformAdminEmail(
  email: string | undefined | null,
  allowlist: string[] = [],
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.map((e) => e.toLowerCase()).includes(normalized);
}

/** Default Work Console home variant for a role. */
export type WorkHomeVariant = 'executive' | 'manager' | 'member' | 'admin';

export function workHomeVariant(role: string | undefined | null): WorkHomeVariant {
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'executive') return 'executive';
  if (role === 'manager') return 'manager';
  return 'member';
}

export const SERVICE_PORTS = {
  apiGateway: 3000,
  identity: 3001,
  integrationHub: 3002,
  ellineaAi: 3003,
  workflow: 3004,
  notification: 3005,
  web: 3100,
} as const;

/** Normalized enterprise summary for Command Center + Ellinea brief. */
export interface EnterpriseSummary {
  organizationId: string;
  connectorId: string;
  connectorName: string;
  healthScore: number;
  connectedSystems: number;
  openAlerts: number;
  openDecisions: number;
  briefHighlight: string;
  timeline: { title: string; detail: string }[];
  syncedAt: string | null;
  status: 'idle' | 'synced' | 'error';
}

export interface ConnectorStatus {
  id: string;
  name: string;
  type: 'api' | 'database' | 'file' | 'email' | 'event';
  status: 'idle' | 'synced' | 'error';
  lastSyncedAt: string | null;
  message?: string;
}
