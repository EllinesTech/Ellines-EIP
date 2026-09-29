/**
 * BehaviourBaselineService — tracks per-user request behaviour in InfluxDB
 * and computes a Redis-cached baseline used by the anomaly detector.
 *
 * Requirements: 15.1, 15.2, 15.3
 */

import { Injectable, Logger } from '@nestjs/common';
import { InfluxDbService } from '../database/influxdb.service';
import { RedisService } from '../database/redis.service';

export interface UserBaseline {
  /** UTC hours (0–23) in which the user typically operates */
  typicalHours: number[];
  /** IP addresses seen in the baseline window */
  typicalIps: string[];
  /** API endpoints accessed in the baseline window */
  typicalEndpoints: string[];
  /** Timestamp when this baseline was computed */
  computedAt: string;
}

@Injectable()
export class BehaviourBaselineService {
  private readonly logger = new Logger(BehaviourBaselineService.name);

  constructor(
    private readonly influx: InfluxDbService,
    private readonly redis: RedisService,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record a single user request to InfluxDB measurement `user_behaviour`.
   *
   * Failures are swallowed — InfluxDB is a best-effort observability store.
   */
  async recordRequest(
    userId: string,
    orgId: string,
    endpoint: string,
    ip: string,
    timestamp: Date,
  ): Promise<void> {
    try {
      await this.influx.writePoint(
        'user_behaviour',
        { user_id: userId },
        { endpoint, ip },
        orgId,
        timestamp.getTime(),
      );
    } catch (err) {
      this.logger.warn(
        `BehaviourBaselineService.recordRequest failed (InfluxDB unavailable?) — ${(err as Error).message}`,
      );
    }
  }

  /**
   * Query InfluxDB for the last `windowDays` days of `user_behaviour` data
   * for the given user, derive a baseline, and cache it in Redis for 24 hours.
   *
   * Key pattern: `eip:{orgId}:behaviour:{userId}`
   *
   * @param userId     Target user ID.
   * @param orgId      Tenant organisation ID.
   * @param windowDays Number of days to look back (default: 14).
   * @returns          The computed baseline, or null when no data is available.
   */
  async buildBaseline(
    userId: string,
    orgId: string,
    windowDays = 14,
  ): Promise<UserBaseline | null> {
    const fluxQuery = `
from(bucket: "eip")
  |> range(start: -${windowDays}d)
  |> filter(fn: (r) => r["_measurement"] == "user_behaviour")
  |> filter(fn: (r) => r["org_id"] == "${orgId}")
  |> filter(fn: (r) => r["user_id"] == "${userId}")
`;

    let rows: Record<string, unknown>[] = [];
    try {
      rows = await this.influx.queryRows(fluxQuery);
    } catch (err) {
      this.logger.warn(
        `BehaviourBaselineService.buildBaseline — InfluxDB query failed: ${(err as Error).message}`,
      );
      return null;
    }

    if (rows.length === 0) {
      return null;
    }

    const hoursSet = new Set<number>();
    const ipsSet = new Set<string>();
    const endpointsSet = new Set<string>();

    for (const row of rows) {
      // InfluxDB time column is ISO-8601
      const timeStr = row['_time'] as string | undefined;
      if (timeStr) {
        const hour = new Date(timeStr).getUTCHours();
        hoursSet.add(hour);
      }

      const field = row['_field'] as string | undefined;
      const value = row['_value'] as string | undefined;
      if (field === 'ip' && value) ipsSet.add(value);
      if (field === 'endpoint' && value) endpointsSet.add(value);
    }

    const baseline: UserBaseline = {
      typicalHours: Array.from(hoursSet).sort((a, b) => a - b),
      typicalIps: Array.from(ipsSet),
      typicalEndpoints: Array.from(endpointsSet),
      computedAt: new Date().toISOString(),
    };

    // Cache in Redis for 24 hours (86 400 seconds)
    const cacheKey = this.redis.buildKey(orgId, 'behaviour', userId);
    try {
      await this.redis.setex(cacheKey, 86_400, JSON.stringify(baseline));
    } catch (err) {
      this.logger.warn(
        `BehaviourBaselineService.buildBaseline — Redis setex failed: ${(err as Error).message}`,
      );
    }

    return baseline;
  }

  /**
   * Retrieve a cached baseline from Redis without recomputing it.
   * Returns null when no cached value exists or Redis is unavailable.
   */
  async getCachedBaseline(userId: string, orgId: string): Promise<UserBaseline | null> {
    const cacheKey = this.redis.buildKey(orgId, 'behaviour', userId);
    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) return null;
      return JSON.parse(raw) as UserBaseline;
    } catch {
      return null;
    }
  }
}
