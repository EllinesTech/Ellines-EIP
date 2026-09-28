import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InfluxDB,
  WriteApi,
  QueryApi,
  Point,
  FluxTableMetaData,
} from '@influxdata/influxdb-client';

export type InfluxTags = Record<string, string>;
export type InfluxFields = Record<string, string | number | boolean>;

/**
 * Wraps the InfluxDB v2 client as a NestJS-injectable service.
 *
 * Tenant isolation
 * ────────────────
 * Every `writePoint` call automatically adds an `org_id` tag.  Callers
 * MUST pass `orgId` (or `org_id` tag) so that each data point is
 * associated with one tenant.  Flux queries that span measurements are
 * the caller's responsibility; they should always filter on the
 * `org_id` tag:
 *   |> filter(fn: (r) => r["org_id"] == "<orgId>")
 *
 * Configuration (via environment / .env):
 *   INFLUXDB_URL    — InfluxDB URL (default: http://localhost:8086)
 *   INFLUXDB_TOKEN  — API token
 *   INFLUXDB_ORG    — InfluxDB organisation name
 *   INFLUXDB_BUCKET — Default bucket (default: eip)
 */
@Injectable()
export class InfluxDbService implements OnModuleDestroy {
  private readonly logger = new Logger(InfluxDbService.name);
  private readonly client: InfluxDB;
  private readonly writeApi: WriteApi;
  private readonly queryApi: QueryApi;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('INFLUXDB_URL', 'http://localhost:8086');
    const token = config.get<string>('INFLUXDB_TOKEN', '');
    const influxOrg = config.get<string>('INFLUXDB_ORG', 'ellines');
    this.bucket = config.get<string>('INFLUXDB_BUCKET', 'eip');

    this.client = new InfluxDB({ url, token });
    this.writeApi = this.client.getWriteApi(influxOrg, this.bucket, 'ms');
    this.queryApi = this.client.getQueryApi(influxOrg);

    this.logger.log(`InfluxDB client initialised → ${url} / ${influxOrg}`);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Write a single data point to the configured bucket.
   *
   * @param measurement  InfluxDB measurement name (table).
   * @param tags         Tag key/value pairs.  `org_id` is injected
   *                     automatically from the mandatory `orgId` param.
   * @param fields       Field key/value pairs (at least one required).
   * @param orgId        Tenant organisation ID — written as the `org_id` tag
   *                     to enforce per-tenant isolation.
   * @param timestamp    Optional timestamp (ms since epoch); defaults to now.
   */
  async writePoint(
    measurement: string,
    tags: InfluxTags,
    fields: InfluxFields,
    orgId: string,
    timestamp?: number,
  ): Promise<void> {
    const point = new Point(measurement);

    // Mandatory tenant isolation tag
    point.tag('org_id', orgId);

    // Caller-supplied tags
    for (const [key, value] of Object.entries(tags)) {
      point.tag(key, value);
    }

    // Fields — detect type at runtime
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'number') {
        // Distinguish integer vs float by checking for decimal part
        if (Number.isInteger(value)) {
          point.intField(key, value);
        } else {
          point.floatField(key, value);
        }
      } else if (typeof value === 'boolean') {
        point.booleanField(key, value);
      } else {
        point.stringField(key, String(value));
      }
    }

    if (timestamp !== undefined) {
      point.timestamp(timestamp);
    }

    this.writeApi.writePoint(point);

    // Flush immediately so the caller can await persistence.
    await this.writeApi.flush();
  }

  /**
   * Execute a Flux query and return all rows as plain objects.
   *
   * @param fluxQuery  Complete Flux query string.  Callers MUST include a
   *                   tenant filter: `|> filter(fn: (r) => r["org_id"] == "${orgId}")`.
   * @returns          Array of row objects keyed by field/tag name.
   */
  async queryRows(fluxQuery: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];

    await new Promise<void>((resolve, reject) => {
      this.queryApi.queryRows(fluxQuery, {
        next(row: string[], meta: FluxTableMetaData) {
          rows.push(meta.toObject(row));
        },
        error(err: Error) {
          reject(err);
        },
        complete() {
          resolve();
        },
      });
    });

    return rows;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    await this.writeApi.close();
    this.logger.log('InfluxDB write API closed');
  }
}
