/**
 * User Behavior Profiler Service
 *
 * Builds and maintains per-role and per-department behavior baselines
 * using Exponential Moving Average (EMA) to learn normal patterns.
 *
 * Requirements: 15.7 — Learn normal behavior patterns per user role and department
 */

import { Injectable, Logger } from '@nestjs/common';
import { UserBehaviorBaseline, UserSession } from './security-anomaly.interfaces';

@Injectable()
export class UserBehaviorProfilerService {
  private readonly logger = new Logger(UserBehaviorProfilerService.name);

  /** EMA smoothing factor (recent observations weighted more heavily) */
  private readonly EMA_ALPHA = 0.2;

  /** Minimum samples before baseline is considered reliable */
  private readonly MIN_RELIABLE_SAMPLES = 3;

  /** Per-user baselines */
  private readonly userBaselines = new Map<string, UserBehaviorBaseline>();

  /** Role-level aggregate baselines (across all users in a role) */
  private readonly roleBaselines = new Map<string, RoleBaseline>();

  /** Department-level aggregate baselines */
  private readonly departmentBaselines = new Map<string, DepartmentBaseline>();

  // ── Update baselines ──────────────────────────────────────────────────────

  /**
   * Record a completed session and update all baselines.
   * Call this at session end after full session data is known.
   */
  recordSession(session: UserSession, role: string, department: string): void {
    this.updateUserBaseline(session, role, department);
    this.updateRoleBaseline(role, session);
    this.updateDepartmentBaseline(department, session);
  }

  private updateUserBaseline(
    session: UserSession,
    role: string,
    department: string,
  ): void {
    const key = session.userId;
    const existing = this.userBaselines.get(key);
    const alpha = this.EMA_ALPHA;

    if (!existing) {
      const baseline: UserBehaviorBaseline = {
        userId: session.userId,
        organizationId: session.organizationId,
        role,
        department,
        avgRequestsPerSession: session.requestCount,
        avgDataAccessedBytes: session.dataAccessedBytes,
        avgExportVolumeBytes: session.exportVolumeBytes,
        typicalActiveHours: [session.startedAt.getHours()],
        typicalCountries: session.countryCode ? [session.countryCode] : [],
        frequentEndpoints: session.endpointsAccessed.slice(0, 10),
        sampleCount: 1,
        updatedAt: new Date(),
      };
      this.userBaselines.set(key, baseline);
      this.logger.debug(`[Profiler] Created user baseline ${session.userId}`);
      return;
    }

    existing.avgRequestsPerSession =
      alpha * session.requestCount + (1 - alpha) * existing.avgRequestsPerSession;
    existing.avgDataAccessedBytes =
      alpha * session.dataAccessedBytes + (1 - alpha) * existing.avgDataAccessedBytes;
    existing.avgExportVolumeBytes =
      alpha * session.exportVolumeBytes + (1 - alpha) * existing.avgExportVolumeBytes;

    const hour = session.startedAt.getHours();
    if (!existing.typicalActiveHours.includes(hour)) {
      existing.typicalActiveHours.push(hour);
    }

    if (session.countryCode && !existing.typicalCountries.includes(session.countryCode)) {
      existing.typicalCountries.push(session.countryCode);
    }

    // Merge endpoints (keep top 20)
    const endpointSet = new Set([...existing.frequentEndpoints, ...session.endpointsAccessed]);
    existing.frequentEndpoints = Array.from(endpointSet).slice(0, 20);

    existing.sampleCount++;
    existing.updatedAt = new Date();
  }

  private updateRoleBaseline(role: string, session: UserSession): void {
    const existing = this.roleBaselines.get(role);
    const alpha = this.EMA_ALPHA;

    if (!existing) {
      this.roleBaselines.set(role, {
        role,
        avgRequestsPerSession: session.requestCount,
        avgDataAccessedBytes: session.dataAccessedBytes,
        avgExportVolumeBytes: session.exportVolumeBytes,
        sampleCount: 1,
        updatedAt: new Date(),
      });
      return;
    }

    existing.avgRequestsPerSession =
      alpha * session.requestCount + (1 - alpha) * existing.avgRequestsPerSession;
    existing.avgDataAccessedBytes =
      alpha * session.dataAccessedBytes + (1 - alpha) * existing.avgDataAccessedBytes;
    existing.avgExportVolumeBytes =
      alpha * session.exportVolumeBytes + (1 - alpha) * existing.avgExportVolumeBytes;
    existing.sampleCount++;
    existing.updatedAt = new Date();
  }

  private updateDepartmentBaseline(department: string, session: UserSession): void {
    const existing = this.departmentBaselines.get(department);
    const alpha = this.EMA_ALPHA;

    if (!existing) {
      this.departmentBaselines.set(department, {
        department,
        avgRequestsPerSession: session.requestCount,
        avgDataAccessedBytes: session.dataAccessedBytes,
        avgExportVolumeBytes: session.exportVolumeBytes,
        sampleCount: 1,
        updatedAt: new Date(),
      });
      return;
    }

    existing.avgRequestsPerSession =
      alpha * session.requestCount + (1 - alpha) * existing.avgRequestsPerSession;
    existing.avgDataAccessedBytes =
      alpha * session.dataAccessedBytes + (1 - alpha) * existing.avgDataAccessedBytes;
    existing.avgExportVolumeBytes =
      alpha * session.exportVolumeBytes + (1 - alpha) * existing.avgExportVolumeBytes;
    existing.sampleCount++;
    existing.updatedAt = new Date();
  }

  // ── Query interface ────────────────────────────────────────────────────────

  getUserBaseline(userId: string): UserBehaviorBaseline | null {
    return this.userBaselines.get(userId) ?? null;
  }

  isUserBaselineReliable(userId: string): boolean {
    const b = this.userBaselines.get(userId);
    return !!b && b.sampleCount >= this.MIN_RELIABLE_SAMPLES;
  }

  getRoleBaseline(role: string): RoleBaseline | null {
    return this.roleBaselines.get(role) ?? null;
  }

  getDepartmentBaseline(department: string): DepartmentBaseline | null {
    return this.departmentBaselines.get(department) ?? null;
  }

  /**
   * Returns the most applicable export volume threshold for a user.
   * Priority: user-specific > role > department > global fallback.
   */
  getExportVolumeBaseline(userId: string, role: string, department: string): number {
    const user = this.userBaselines.get(userId);
    if (user && user.sampleCount >= this.MIN_RELIABLE_SAMPLES) {
      return user.avgExportVolumeBytes;
    }
    const roleB = this.roleBaselines.get(role);
    if (roleB && roleB.sampleCount >= this.MIN_RELIABLE_SAMPLES) {
      return roleB.avgExportVolumeBytes;
    }
    const deptB = this.departmentBaselines.get(department);
    if (deptB && deptB.sampleCount >= this.MIN_RELIABLE_SAMPLES) {
      return deptB.avgExportVolumeBytes;
    }
    // Global fallback: 50 MB
    return 50 * 1024 * 1024;
  }

  /**
   * Returns the most applicable request count baseline.
   */
  getRequestCountBaseline(userId: string, role: string, department: string): number {
    const user = this.userBaselines.get(userId);
    if (user && user.sampleCount >= this.MIN_RELIABLE_SAMPLES) {
      return user.avgRequestsPerSession;
    }
    const roleB = this.roleBaselines.get(role);
    if (roleB && roleB.sampleCount >= this.MIN_RELIABLE_SAMPLES) {
      return roleB.avgRequestsPerSession;
    }
    const deptB = this.departmentBaselines.get(department);
    if (deptB && deptB.sampleCount >= this.MIN_RELIABLE_SAMPLES) {
      return deptB.avgRequestsPerSession;
    }
    return 100; // global fallback
  }

  /** List all user baselines for an organization */
  listOrganizationBaselines(organizationId: string): UserBehaviorBaseline[] {
    return Array.from(this.userBaselines.values()).filter(
      (b) => b.organizationId === organizationId,
    );
  }

  /** Seed a baseline directly (for testing or admin import) */
  seedBaseline(baseline: UserBehaviorBaseline): void {
    this.userBaselines.set(baseline.userId, baseline);
    this.logger.log(`[Profiler] Seeded baseline for ${baseline.userId}`);
  }
}

// ── Supporting types ──────────────────────────────────────────────────────────

export interface RoleBaseline {
  role: string;
  avgRequestsPerSession: number;
  avgDataAccessedBytes: number;
  avgExportVolumeBytes: number;
  sampleCount: number;
  updatedAt: Date;
}

export interface DepartmentBaseline {
  department: string;
  avgRequestsPerSession: number;
  avgDataAccessedBytes: number;
  avgExportVolumeBytes: number;
  sampleCount: number;
  updatedAt: Date;
}
