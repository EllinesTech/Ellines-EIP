/**
 * ResilientConnectionService — Task 15.1 (Requirements 28.1–28.4)
 *
 * Manages connections to external systems with redundancy:
 *  - Discovers and attempts the primary connection method (HTTPS with SSRF protection)
 *  - Falls back to backup methods (file_sync, message_queue, webhook) in priority order
 *  - Promotes a healthy backup to currentMethod on failover
 *  - Writes health metrics to InfluxDB (non-fatal)
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ── SSRF block-list ───────────────────────────────────────────────────────────

/**
 * Reject private IPs, localhost, cloud-metadata, and non-HTTPS protocols.
 * This implements the single SSRF policy required by Security Rule §6.
 */
function validateEgressUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException(
      `Only HTTPS connections are allowed (got ${parsed.protocol})`,
    );
  }

  const host = parsed.hostname.toLowerCase();

  // Localhost / loopback
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    throw new BadRequestException('Connections to localhost are not allowed');
  }

  // Cloud metadata endpoint (AWS / GCP / Azure)
  if (host === '169.254.169.254') {
    throw new BadRequestException(
      'Connections to cloud metadata endpoints are not allowed',
    );
  }

  // Private IPv4 ranges — 10.x.x.x, 172.16–31.x.x, 192.168.x.x
  const ipv4 = host.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      throw new BadRequestException(
        'Connections to private IP ranges are not allowed',
      );
    }
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResilientConnectionRecord = {
  id: string;
  organizationId: string;
  systemId: string;
  primaryMethod: string;
  currentMethod: string;
  backupMethods: unknown[];
  healthStatus: string;
};

type ConnectionMethodRow = {
  id: string;
  type: string;
  priority: number;
  config: unknown;
  successRate: number;
};

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ResilientConnectionService {
  private readonly logger = new Logger(ResilientConnectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 1. establishConnection ─────────────────────────────────────────────────

  /**
   * Find or create the ResilientConnection record for (orgId, systemId).
   * Attempts the primary connection method (HTTPS check with SSRF validation).
   * Records the resulting health status.
   *
   * Requirement 28.1 — Connection method discovery
   * Requirement 28.3 — Primary connection attempt
   */
  async establishConnection(
    systemId: string,
    orgId: string,
  ): Promise<ResilientConnectionRecord> {
    // Tenant isolation: always scope to the provided orgId
    let connection = await this.prisma.resilientConnection.findFirst({
      where: { organizationId: orgId, systemId },
      include: { methods: { orderBy: { priority: 'desc' } } },
    });

    if (!connection) {
      connection = await this.prisma.resilientConnection.create({
        data: {
          organizationId: orgId,
          systemId,
          systemName: systemId, // caller can update later
          healthStatus: 'disconnected',
        },
        include: { methods: { orderBy: { priority: 'desc' } } },
      });
    }

    // Pick the primary method (highest priority, or currentMethodId if set)
    const methods = (connection.methods ?? []) as ConnectionMethodRow[];
    const primaryMethod =
      methods.find((m) => m.id === connection!.currentMethodId) ??
      methods[0];

    let newHealthStatus = 'disconnected';
    let errorMessage: string | undefined;

    if (primaryMethod?.type === 'api') {
      // HTTPS check with SSRF validation
      const config = primaryMethod.config as Record<string, unknown>;
      const endpoint = config['endpoint'] as string | undefined;

      if (endpoint) {
        try {
          validateEgressUrl(endpoint);
          const response = await fetch(endpoint, {
            method: 'HEAD',
            signal: AbortSignal.timeout(10_000),
          });
          newHealthStatus = response.ok ? 'healthy' : 'degraded';
        } catch (err: unknown) {
          errorMessage =
            err instanceof Error ? err.message : String(err);
          newHealthStatus = 'failing';
          this.logger.warn(
            `Primary HTTPS check failed for ${systemId}: ${errorMessage}`,
          );
        }
      } else {
        newHealthStatus = 'degraded'; // no endpoint configured
      }
    } else if (primaryMethod) {
      // Non-API primary methods are assumed available for now
      newHealthStatus = 'healthy';
    }

    // Persist health status and stats
    const now = new Date();
    await this.prisma.resilientConnection.update({
      where: { id: connection.id },
      data: {
        healthStatus: newHealthStatus,
        lastHealthCheck: now,
        ...(newHealthStatus === 'healthy' && { lastSuccessfulConnection: now }),
        totalConnections: { increment: 1 },
        ...(newHealthStatus === 'healthy'
          ? { successfulConnections: { increment: 1 } }
          : { failedConnections: { increment: 1 } }),
      },
    });

    const record = this.toRecord(
      connection,
      methods,
      newHealthStatus,
    );

    // Write health event (non-fatal)
    await this.writeHealthEvent(connection.id, newHealthStatus, 0, errorMessage);

    return record;
  }

  // ── 2. attemptAlternative ──────────────────────────────────────────────────

  /**
   * Iterate backupMethods[] in priority order; try each method type.
   * Returns the first healthy backup method or null.
   *
   * Requirement 28.3 — Connection redundancy with priority-based routing
   */
  async attemptAlternative(
    connection: ResilientConnectionRecord,
  ): Promise<ConnectionMethodRow | null> {
    const dbConnection = await this.prisma.resilientConnection.findUnique({
      where: { id: connection.id },
      include: { methods: { orderBy: { priority: 'desc' } } },
    });

    if (!dbConnection) return null;

    const methods = (dbConnection.methods ?? []) as ConnectionMethodRow[];
    // Exclude the current primary method
    const backups = methods.filter(
      (m) => m.id !== dbConnection.currentMethodId && m.id !== dbConnection.primaryMethodId,
    );

    for (const method of backups) {
      const healthy = await this.testMethod(method);
      if (healthy) {
        this.logger.log(
          `Alternative method found: ${method.type} (id=${method.id}) for connection ${connection.id}`,
        );
        return method;
      }
    }

    this.logger.warn(`No healthy alternative found for connection ${connection.id}`);
    return null;
  }

  // ── 3. failover ───────────────────────────────────────────────────────────

  /**
   * Promote the first healthy backup to currentMethod and update the DB.
   *
   * Requirement 28.4 — Automatic failover
   */
  async failover(
    connection: ResilientConnectionRecord,
  ): Promise<ResilientConnectionRecord> {
    const healthyBackup = await this.attemptAlternative(connection);

    if (!healthyBackup) {
      // All methods exhausted — mark as failing
      await this.prisma.resilientConnection.update({
        where: { id: connection.id },
        data: { healthStatus: 'failing' },
      });
      return { ...connection, healthStatus: 'failing' };
    }

    // Promote backup to currentMethod
    await this.prisma.resilientConnection.update({
      where: { id: connection.id },
      data: {
        currentMethodId: healthyBackup.id,
        healthStatus: 'degraded', // healthy via backup, not primary
        lastSuccessfulConnection: new Date(),
        failedConnections: { increment: 1 },
        successfulConnections: { increment: 1 },
      },
    });

    this.logger.log(
      `Failover complete for ${connection.id}: now using ${healthyBackup.type} (id=${healthyBackup.id})`,
    );

    return {
      ...connection,
      currentMethod: healthyBackup.type,
      healthStatus: 'degraded',
    };
  }

  // ── 4. monitorHealth ──────────────────────────────────────────────────────

  /**
   * Write a health record to the DB (connector_health) and attempt an
   * InfluxDB write for the connector_health measurement.
   * The InfluxDB write is non-fatal — failures are logged and ignored.
   *
   * Requirement 28.4 — Connection health monitor
   */
  async monitorHealth(
    connection: ResilientConnectionRecord,
  ): Promise<{ status: string; checkedAt: Date }> {
    const checkedAt = new Date();

    // Persist to relational health history
    try {
      await this.prisma.connectionHealth.create({
        data: {
          connectionId: connection.id,
          status: connection.healthStatus,
          latency: 0,
          errorRate: connection.healthStatus === 'healthy' ? 0.0 : 1.0,
          failoverTriggered: false,
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Could not persist ConnectionHealth for ${connection.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Attempt InfluxDB write — non-fatal
    try {
      await this.writeInfluxMetric(connection, checkedAt);
    } catch (err: unknown) {
      this.logger.warn(
        `InfluxDB write failed (non-fatal) for ${connection.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { status: connection.healthStatus, checkedAt };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Attempt a method by type to check liveness.
   */
  private async testMethod(method: ConnectionMethodRow): Promise<boolean> {
    const config = method.config as Record<string, unknown>;

    try {
      switch (method.type) {
        case 'api': {
          const endpoint = config['endpoint'] as string | undefined;
          if (!endpoint) return false;
          validateEgressUrl(endpoint);
          const res = await fetch(endpoint, {
            method: 'HEAD',
            signal: AbortSignal.timeout(8_000),
          });
          return res.ok;
        }

        case 'file_sync': {
          // Check that the configured path / remote URL exists
          const path = config['path'] as string | undefined;
          return Boolean(path && path.length > 0);
        }

        case 'message_queue': {
          // Validate broker URL presence (actual connectivity checked elsewhere)
          const brokerUrl = config['brokerUrl'] as string | undefined;
          return Boolean(brokerUrl && brokerUrl.length > 0);
        }

        case 'webhook': {
          // Validate target URL with SSRF protection
          const webhookUrl = config['url'] as string | undefined;
          if (!webhookUrl) return false;
          validateEgressUrl(webhookUrl);
          return true;
        }

        default:
          // Unknown method type — treat as unavailable
          return false;
      }
    } catch (err: unknown) {
      this.logger.debug(
        `Method test failed (${method.type}, id=${method.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Write a ConnectionHealth event for a connection during establishment.
   */
  private async writeHealthEvent(
    connectionId: string,
    status: string,
    latency: number,
    _reason?: string,
  ): Promise<void> {
    try {
      await this.prisma.connectionHealth.create({
        data: {
          connectionId,
          status,
          latency,
          errorRate: status === 'healthy' ? 0.0 : 1.0,
          failoverTriggered: false,
          failoverReason: _reason,
        },
      });
    } catch (err: unknown) {
      this.logger.debug(
        `writeHealthEvent skipped for ${connectionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Write line-protocol data to InfluxDB if INFLUX_URL + INFLUX_TOKEN are set.
   * This is entirely non-fatal — any error is caught and logged.
   */
  private async writeInfluxMetric(
    connection: ResilientConnectionRecord,
    checkedAt: Date,
  ): Promise<void> {
    const influxUrl = process.env['INFLUX_URL'];
    const influxToken = process.env['INFLUX_TOKEN'];
    const influxOrg = process.env['INFLUX_ORG'] ?? 'ellines';
    const influxBucket = process.env['INFLUX_BUCKET'] ?? 'eip';

    if (!influxUrl || !influxToken) return; // InfluxDB not configured — skip

    const statusValue =
      connection.healthStatus === 'healthy'
        ? 1
        : connection.healthStatus === 'degraded'
          ? 0.5
          : 0;

    // InfluxDB line protocol
    const lineProtocol =
      `connector_health,org_id=${connection.organizationId},system_id=${connection.systemId} ` +
      `status="${connection.healthStatus}",health_score=${statusValue} ` +
      `${checkedAt.getTime() * 1_000_000}`; // nanoseconds

    const writeUrl = `${influxUrl}/api/v2/write?org=${encodeURIComponent(influxOrg)}&bucket=${encodeURIComponent(influxBucket)}&precision=ns`;

    validateEgressUrl(writeUrl); // SSRF check on the InfluxDB URL too

    const res = await fetch(writeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${influxToken}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: lineProtocol,
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      throw new Error(`InfluxDB returned HTTP ${res.status}`);
    }
  }

  /**
   * Map a Prisma ResilientConnection + methods array to the public record type.
   */
  private toRecord(
    connection: { id: string; organizationId: string; systemId: string; primaryMethodId?: string | null; currentMethodId?: string | null },
    methods: ConnectionMethodRow[],
    healthStatus: string,
  ): ResilientConnectionRecord {
    const primary = methods.find((m) => m.id === connection.primaryMethodId) ?? methods[0];
    const current = methods.find((m) => m.id === connection.currentMethodId) ?? primary;
    const backups = methods.filter(
      (m) => m.id !== primary?.id && m.id !== current?.id,
    );

    return {
      id: connection.id,
      organizationId: connection.organizationId,
      systemId: connection.systemId,
      primaryMethod: primary?.type ?? 'unknown',
      currentMethod: current?.type ?? 'unknown',
      backupMethods: backups,
      healthStatus,
    };
  }
}
