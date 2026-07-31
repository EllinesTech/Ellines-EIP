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

/**
 * Roles IT (`admin`) may assign. Owner may also assign `owner` and `admin` (IT).
 * Work roles only for delegated IT — authority to grant IT stays with Owner.
 */
export const ORG_IT_ASSIGNABLE_ROLES: UserRole[] = [
  'executive',
  'manager',
  'member',
  'viewer',
];

/** @deprecated Prefer rolesAssignableBy(actorRole) */
export const ORG_ASSIGNABLE_ROLES: UserRole[] = [
  'admin',
  'executive',
  'manager',
  'member',
  'viewer',
];

/** Human labels — Owner = business org admin; admin = invited IT. */
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner (business)',
  admin: 'IT Admin',
  executive: 'Executive',
  manager: 'Manager',
  member: 'Member',
  viewer: 'Viewer',
};

export function roleLabel(role: string | undefined | null): string {
  if (!role) return 'Unknown';
  return ROLE_LABELS[role as UserRole] || role;
}

/** Roles the actor is allowed to assign when inviting / changing users. */
export function rolesAssignableBy(actorRole: string | undefined | null): UserRole[] {
  if (actorRole === 'owner') return [...EIP_ROLES];
  if (actorRole === 'admin') return [...ORG_IT_ASSIGNABLE_ROLES];
  return [];
}

/**
 * Owner grants IT. IT cannot create Owner or IT Admin — only work roles.
 * Returns an error message or null if allowed.
 */
export function assertCanAssignRole(
  actorRole: string | undefined | null,
  nextRole: UserRole,
): string | null {
  if (actorRole === 'owner') return null;
  if (actorRole === 'admin') {
    if (nextRole === 'owner' || nextRole === 'admin') {
      return 'Only the Owner can assign Owner or IT Admin';
    }
    if (!ORG_IT_ASSIGNABLE_ROLES.includes(nextRole)) {
      return 'IT Admin cannot assign that role';
    }
    return null;
  }
  return 'Only Owner or IT Admin can assign roles';
}

/**
 * IT may manage work users only. Owner/IT accounts are Owner-controlled.
 */
export function assertCanManageOrgUser(
  actorRole: string | undefined | null,
  targetRole: string | undefined | null,
): string | null {
  if (actorRole === 'owner') return null;
  if (actorRole === 'admin') {
    if (targetRole === 'owner' || targetRole === 'admin') {
      return 'Only the Owner can manage Owner or IT Admin accounts';
    }
    return null;
  }
  return 'Only Owner or IT Admin can manage users';
}

export function isOrgAdminRole(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function isOrgOwnerRole(role: string | undefined | null): boolean {
  return role === 'owner';
}

export function isOrgItRole(role: string | undefined | null): boolean {
  return role === 'admin';
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

/** Org display prefs — set by Owner/IT Admin or Platform Super Admin. */
export type TimeFormat = '12h' | '24h';
export type DateStyle = 'short' | 'medium' | 'log';

export interface OrgDateTimeSettings {
  timeFormat: TimeFormat;
  dateStyle: DateStyle;
}

export const DEFAULT_ORG_DATETIME_SETTINGS: OrgDateTimeSettings = {
  timeFormat: '12h',
  dateStyle: 'short',
};

export function normalizeOrgDateTimeSettings(raw: unknown): OrgDateTimeSettings {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const timeFormat: TimeFormat = obj.timeFormat === '24h' ? '24h' : '12h';
  const dateStyle: DateStyle =
    obj.dateStyle === 'medium' || obj.dateStyle === 'log' ? obj.dateStyle : 'short';
  return { timeFormat, dateStyle };
}

/** Org-scoped Ellinea Enterprise Memory notes (stored under organizations.settings). */
export type EllineaMemoryNoteDto = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export function normalizeEllineaMemoryNotes(raw: unknown): EllineaMemoryNoteDto[] {
  if (!Array.isArray(raw)) return [];
  const out: EllineaMemoryNoteDto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const n = item as Record<string, unknown>;
    const id = typeof n.id === 'string' ? n.id.trim() : '';
    const title = typeof n.title === 'string' ? n.title.trim() : '';
    const body = typeof n.body === 'string' ? n.body.trim() : '';
    const updatedAt =
      typeof n.updatedAt === 'string' && n.updatedAt
        ? n.updatedAt
        : new Date().toISOString();
    if (!id || !title || !body) continue;
    out.push({ id, title, body, updatedAt });
    if (out.length >= 40) break;
  }
  return out;
}

/** Merge patch into org settings JSON without dropping sibling keys. */
export function mergeOrganizationSettings(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

/** Short clock / log-style date+time for shell, timelines, and audit UIs. */
export function formatOrgDateTime(
  date: Date,
  settings: OrgDateTimeSettings = DEFAULT_ORG_DATETIME_SETTINGS,
): { day: string; time: string; iso: string } {
  const prefs = normalizeOrgDateTimeSettings(settings);
  let day: string;
  if (prefs.dateStyle === 'log') {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    day = `${y}-${m}-${d}`;
  } else if (prefs.dateStyle === 'medium') {
    day = date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } else {
    day = date.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: prefs.timeFormat === '12h',
  });
  return { day, time, iso: date.toISOString() };
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

export {
  UEM_OBJECT_KINDS,
  emptyUemCounts,
  inferUemFromMetrics,
  normalizeUemModel,
  packTimelineStorage,
  unpackTimelineStorage,
  type EnterpriseTimelineEvent,
  type TimelineStorage,
  type UemCounts,
  type UemModel,
  type UemObject,
  type UemObjectKind,
} from './uem';

import type { UemModel } from './uem';

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
  /** Universal Enterprise Model slice from last sync (optional for legacy snapshots). */
  model?: UemModel | null;
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

/** Saved per-org connector install (wizard). Secrets redacted on list/get. */
export interface ConnectorInstallation {
  id: string;
  organizationId: string;
  catalogId: string;
  displayName: string;
  status: 'draft' | 'tested' | 'synced' | 'error';
  lastTestAt: string | null;
  lastSyncedAt: string | null;
  lastMessage?: string | null;
  packId?: string | null;
  /** Non-secret config echo; secret fields appear as `***` when set. */
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Platform-published pack — Org IT installs with credentials only. */
export interface ConnectorPack {
  id: string;
  slug: string;
  name: string;
  description: string;
  catalogId: string;
  templateConfig: Record<string, unknown>;
  published: boolean;
  createdByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}
