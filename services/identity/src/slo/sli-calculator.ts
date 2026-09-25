import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Calculates Service Level Indicators (SLIs) from real audit_log data.
 *
 * Each SLI is derived from actual records in the database:
 *  - API availability: ratio of non-5xx audit_log entries within the window
 *  - Permission check: ratio of 'auth.permission.granted' vs total 'auth.permission.*' events
 *  - Connector sync: ratio of 'connector.sync' successes vs 'connector.sync.error' events
 *  - Rule execution: ratio of 'rule.executed' vs 'rule.execution.error' events
 *
 * When insufficient data exists for a window, the SLI returns null and the
 * caller surfaces "Insufficient data" rather than a fake number.
 */
@Injectable()
export class SLICalculator {
  constructor(private prisma: PrismaService) {}

  private windowStart(window: 'hour' | 'day' | 'month'): Date {
    const now = new Date();
    if (window === 'hour')  return new Date(now.getTime() - 60 * 60 * 1000);
    if (window === 'day')   return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  /**
   * API availability: (successful API calls) / (total API calls) × 100
   * Derived from audit_log where action starts with 'api.' and metadata.status exists.
   * Returns null when fewer than 10 records exist (insufficient data).
   */
  async calculateAPIAvailability(window: 'hour' | 'day' | 'month' = 'hour'): Promise<number | null> {
    const since = this.windowStart(window);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: since },
        action: { startsWith: 'api.' },
      },
      select: { metadata: true },
    });
    if (rows.length < 10) return null;
    const errors = rows.filter((r) => {
      const m = r.metadata as Record<string, unknown> | null;
      const status = typeof m?.status === 'number' ? m.status : 0;
      return status >= 500;
    }).length;
    return Math.round(((rows.length - errors) / rows.length) * 10000) / 100;
  }

  /**
   * Permission check SLI: granted checks / total permission checks × 100
   */
  async calculatePermissionSLI(window: 'hour' | 'day' | 'month' = 'hour'): Promise<number | null> {
    const since = this.windowStart(window);
    const [granted, total] = await Promise.all([
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, action: 'auth.permission.granted' },
      }),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, action: { startsWith: 'auth.permission.' } },
      }),
    ]);
    if (total < 5) return null;
    return Math.round((granted / total) * 10000) / 100;
  }

  /**
   * Connector sync SLI: successful syncs / (successful + failed syncs) × 100
   */
  async calculateConnectorSyncSLI(window: 'hour' | 'day' | 'month' = 'hour'): Promise<number | null> {
    const since = this.windowStart(window);
    const [ok, err] = await Promise.all([
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, action: 'connector.sync' },
      }),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, action: 'connector.sync.error' },
      }),
    ]);
    const total = ok + err;
    if (total < 3) return null;
    return Math.round((ok / total) * 10000) / 100;
  }

  /**
   * Rule execution SLI: successful executions / total executions × 100
   */
  async calculateRuleExecutionSLI(window: 'hour' | 'day' | 'month' = 'hour'): Promise<number | null> {
    const since = this.windowStart(window);
    const [ok, err] = await Promise.all([
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, action: 'rule.executed' },
      }),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: since }, action: 'rule.execution.error' },
      }),
    ]);
    const total = ok + err;
    if (total < 3) return null;
    return Math.round((ok / total) * 10000) / 100;
  }

  /**
   * Dashboard performance SLI: requests under 500ms / total dashboard requests × 100
   * Requires audit_log entries with action 'dashboard.render' and metadata.durationMs.
   */
  async calculateDashboardPerformanceSLI(window: 'hour' | 'day' | 'month' = 'hour'): Promise<number | null> {
    const since = this.windowStart(window);
    const rows = await this.prisma.auditLog.findMany({
      where: { createdAt: { gte: since }, action: 'dashboard.render' },
      select: { metadata: true },
    });
    if (rows.length < 5) return null;
    const fast = rows.filter((r) => {
      const m = r.metadata as Record<string, unknown> | null;
      const ms = typeof m?.durationMs === 'number' ? m.durationMs : 9999;
      return ms < 500;
    }).length;
    return Math.round((fast / rows.length) * 10000) / 100;
  }

  /**
   * Get all SLIs for dashboard display.
   * null values indicate "Insufficient data for this window" — never a fake number.
   */
  async getAllSLIs(window: 'hour' | 'day' | 'month' = 'hour') {
    const [
      apiAvailability,
      permissionCheck,
      connectorSync,
      ruleExecution,
      dashboardPerformance,
    ] = await Promise.all([
      this.calculateAPIAvailability(window),
      this.calculatePermissionSLI(window),
      this.calculateConnectorSyncSLI(window),
      this.calculateRuleExecutionSLI(window),
      this.calculateDashboardPerformanceSLI(window),
    ]);

    return {
      window,
      timestamp: new Date().toISOString(),
      slis: {
        apiAvailability: {
          value: apiAvailability,
          slo: 99.5,
          target: '99.5%',
          status: apiAvailability !== null ? this.determineStatus(apiAvailability, 99.5) : 'no_data',
        },
        permissionCheck: {
          value: permissionCheck,
          slo: 99.9,
          target: '99.9%',
          status: permissionCheck !== null ? this.determineStatus(permissionCheck, 99.9) : 'no_data',
        },
        connectorSync: {
          value: connectorSync,
          slo: 95.0,
          target: '95.0%',
          status: connectorSync !== null ? this.determineStatus(connectorSync, 95.0) : 'no_data',
        },
        ruleExecution: {
          value: ruleExecution,
          slo: 99.0,
          target: '99.0%',
          status: ruleExecution !== null ? this.determineStatus(ruleExecution, 99.0) : 'no_data',
        },
        dashboardPerformance: {
          value: dashboardPerformance,
          slo: 98.0,
          target: '98.0% (p95 < 500ms)',
          status: dashboardPerformance !== null ? this.determineStatus(dashboardPerformance, 98.0) : 'no_data',
        },
      },
    };
  }

  private determineStatus(sli: number, slo: number): 'green' | 'yellow' | 'red' {
    if (sli >= slo) return 'green';
    if (sli >= slo - 1) return 'yellow';
    return 'red';
  }
}
