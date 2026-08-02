import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** A single permission entry stored in CustomRole.permissions JSON array */
export interface PermissionEntry {
  /** e.g. 'connector:install', 'approval:decide', 'org:manage_members' */
  permission: string;
  /** Specific resource IDs allowed; empty/undefined = all resources */
  resources?: string[];
  /** Attribute conditions e.g. { department: 'IT', branch: 'HQ' } */
  attributes?: Record<string, string | number | boolean>;
  /** Additional conditions e.g. { userOrg: 'match' } */
  conditions?: Record<string, unknown>;
}

export interface EvaluationContext {
  userId: string;
  organizationId: string;
  /** The permission verb+resource e.g. 'connector:install' */
  permission: string;
  /** Specific resource ID being accessed (optional) */
  resourceId?: string;
  /** Caller's attribute bag for ABAC checks */
  attributes?: Record<string, string | number | boolean>;
}

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a user's effective permissions in an org.
   * Priority: customRole.permissions > fixed role default permissions.
   */
  async resolvePermissions(
    userId: string,
    organizationId: string,
  ): Promise<PermissionEntry[]> {
    // Try membership table first (multi-org support)
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { customRole: true },
    });

    if (membership?.customRole?.permissions) {
      return (membership.customRole.permissions as unknown as PermissionEntry[]) ?? [];
    }

    // Fall back to user's fixed role
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) return [];

    return this.fixedRolePermissions(user.role as string);
  }

  /**
   * Evaluate whether userId can perform `permission` on optional `resourceId`.
   * Returns true or false — never throws. Use assertPermission to throw.
   */
  async can(ctx: EvaluationContext): Promise<boolean> {
    const entries = await this.resolvePermissions(ctx.userId, ctx.organizationId);
    return this.evaluate(entries, ctx);
  }

  /**
   * Like `can` but throws ForbiddenException when denied.
   */
  async assertPermission(ctx: EvaluationContext): Promise<void> {
    const allowed = await this.can(ctx);
    if (!allowed) {
      throw new ForbiddenException(
        `Permission denied: ${ctx.permission}${ctx.resourceId ? ` on ${ctx.resourceId}` : ''}`,
      );
    }
  }

  /** Core evaluation logic — pure function, easy to unit-test */
  evaluate(entries: PermissionEntry[], ctx: EvaluationContext): boolean {
    const target = ctx.permission.toLowerCase();

    for (const entry of entries) {
      const entryPerm = entry.permission.toLowerCase();

      // Wildcard '*' grants everything
      if (entryPerm === '*') return true;

      // Prefix wildcard e.g. 'connector:*' matches 'connector:install'
      if (entryPerm.endsWith(':*')) {
        const prefix = entryPerm.slice(0, -1); // 'connector:'
        if (!target.startsWith(prefix)) continue;
      } else if (entryPerm !== target) {
        continue;
      }

      // Permission verb matches — now check resource scope
      if (
        ctx.resourceId &&
        entry.resources &&
        entry.resources.length > 0 &&
        !entry.resources.includes(ctx.resourceId)
      ) {
        continue; // Resource not in allowed list
      }

      // Check attribute conditions (ABAC)
      if (entry.attributes && ctx.attributes) {
        const attrMatch = Object.entries(entry.attributes).every(
          ([k, v]) => ctx.attributes![k] === v,
        );
        if (!attrMatch) continue;
      }

      return true; // All checks passed
    }

    return false;
  }

  /**
   * Default permissions for each fixed role.
   * Custom roles supplement or replace these.
   */
  fixedRolePermissions(role: string): PermissionEntry[] {
    switch (role) {
      case 'owner':
        return [{ permission: '*' }]; // Full access

      case 'admin':
        return [
          { permission: 'org:view' },
          { permission: 'org:manage_members' },
          { permission: 'org:manage_branches' },
          { permission: 'org:manage_departments' },
          { permission: 'connector:*' },
          { permission: 'approval:*' },
          { permission: 'rule:*' },
          { permission: 'report:*' },
          { permission: 'audit:view' },
          { permission: 'document:*' },
          { permission: 'ellinea:*' },
          { permission: 'webhook:*' },
          { permission: 'notification:*' },
          { permission: 'sso:view' },
        ];

      case 'executive':
        return [
          { permission: 'org:view' },
          { permission: 'connector:read' },
          { permission: 'approval:view' },
          { permission: 'approval:decide' },
          { permission: 'rule:view' },
          { permission: 'report:view' },
          { permission: 'report:run' },
          { permission: 'document:view' },
          { permission: 'document:upload' },
          { permission: 'ellinea:ask' },
          { permission: 'ellinea:view' },
          { permission: 'audit:view' },
          { permission: 'notification:view' },
        ];

      case 'manager':
        return [
          { permission: 'org:view' },
          { permission: 'connector:read' },
          { permission: 'approval:view' },
          { permission: 'approval:request' },
          { permission: 'rule:view' },
          { permission: 'report:view' },
          { permission: 'report:run' },
          { permission: 'document:view' },
          { permission: 'document:upload' },
          { permission: 'ellinea:ask' },
          { permission: 'notification:view' },
        ];

      case 'member':
        return [
          { permission: 'org:view' },
          { permission: 'connector:read' },
          { permission: 'approval:view' },
          { permission: 'approval:request' },
          { permission: 'report:view' },
          { permission: 'document:view' },
          { permission: 'ellinea:ask' },
          { permission: 'notification:view' },
        ];

      case 'viewer':
        return [
          { permission: 'org:view' },
          { permission: 'connector:read' },
          { permission: 'report:view' },
          { permission: 'document:view' },
          { permission: 'notification:view' },
        ];

      default:
        return [];
    }
  }
}
