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

export const SERVICE_PORTS = {
  apiGateway: 3000,
  identity: 3001,
  integrationHub: 3002,
  ellineaAi: 3003,
  workflow: 3004,
  notification: 3005,
  web: 3100,
} as const;
