/**
 * InfluxDB Metrics Service
 *
 * Writes and queries time-series health and performance metrics.
 * Requirements: 4.1, 4.6, 17.3, 21.6
 */

export interface MetricPoint {
  measurement: string;
  tags: Record<string, string>;
  fields: Record<string, number | string | boolean>;
  timestamp?: Date;
}

export interface InfluxWriteApi {
  writePoint(point: MetricPoint): void;
  close(): Promise<void>;
}

export interface InfluxQueryResult {
  _measurement: string;
  _field: string;
  _value: number | string;
  _time: string;
  [tag: string]: string | number | boolean;
}

export interface InfluxQueryApi {
  collectRows<T = InfluxQueryResult>(query: string): Promise<T[]>;
}

export interface InfluxDBClient {
  getWriteApi(org: string, bucket: string, precision?: string): InfluxWriteApi;
  getQueryApi(org: string): InfluxQueryApi;
}

export interface SystemHealthSnapshot {
  service: string;
  component: string;
  cpuPercent: number;
  memoryMb: number;
  uptimeSeconds: number;
  timestamp?: Date;
}

export interface ApiRequestMetric {
  service: string;
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  requestSize?: number;
  responseSize?: number;
  organizationId?: string;
  timestamp?: Date;
}

export interface SelfHealingEventMetric {
  organizationId: string;
  errorCategory: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  actionType: string;
  outcome: 'success' | 'failure' | 'partial_success' | 'escalated';
  detectionLatencyMs: number;
  remediationLatencyMs: number;
  confidenceScore: number;
  attempts: number;
  timestamp?: Date;
}

export interface RangeQueryOptions {
  start: string; // e.g. '-1h', '-24h', '2024-01-01T00:00:00Z'
  stop?: string;
  measurement: string;
  field: string;
  filters?: Record<string, string>;
  aggregateFn?: 'mean' | 'sum' | 'count' | 'max' | 'min';
  windowEvery?: string;
}

export class InfluxDbMetricsService {
  constructor(
    private readonly influxClient: InfluxDBClient,
    private readonly org: string,
    private readonly bucket: string,
  ) {}

  /**
   * Write a system health snapshot to InfluxDB.
   * Requirement 4.1: Monitor platform components.
   */
  writeSystemHealth(snapshot: SystemHealthSnapshot): void {
    const writeApi = this.influxClient.getWriteApi(this.org, this.bucket, 'ms');
    const point: MetricPoint = {
      measurement: 'system_health',
      tags: {
        service: snapshot.service,
        component: snapshot.component,
      },
      fields: {
        cpu_percent: snapshot.cpuPercent,
        memory_mb: snapshot.memoryMb,
        uptime_seconds: snapshot.uptimeSeconds,
      },
      timestamp: snapshot.timestamp,
    };
    writeApi.writePoint(point);
  }

  /**
   * Write an API request metric to InfluxDB.
   * Requirement 21.6: Performance monitoring.
   */
  writeApiRequest(metric: ApiRequestMetric): void {
    const writeApi = this.influxClient.getWriteApi(this.org, this.bucket, 'ms');
    const point: MetricPoint = {
      measurement: 'api_request',
      tags: {
        service: metric.service,
        endpoint: metric.endpoint,
        method: metric.method,
        status: String(metric.status),
        ...(metric.organizationId && { organizationId: metric.organizationId }),
      },
      fields: {
        duration_ms: metric.durationMs,
        ...(metric.requestSize !== undefined && { request_size: metric.requestSize }),
        ...(metric.responseSize !== undefined && { response_size: metric.responseSize }),
      },
      timestamp: metric.timestamp,
    };
    writeApi.writePoint(point);
  }

  /**
   * Write a self-healing event to InfluxDB.
   * Requirement 4.1, 4.6: Incident and remediation tracking.
   */
  writeSelfHealingEvent(event: SelfHealingEventMetric): void {
    const writeApi = this.influxClient.getWriteApi(this.org, this.bucket, 'ms');
    const point: MetricPoint = {
      measurement: 'self_healing_event',
      tags: {
        organizationId: event.organizationId,
        error_category: event.errorCategory,
        severity: event.severity,
        action_type: event.actionType,
        outcome: event.outcome,
      },
      fields: {
        detection_latency_ms: event.detectionLatencyMs,
        remediation_latency_ms: event.remediationLatencyMs,
        confidence_score: event.confidenceScore,
        attempts: event.attempts,
      },
      timestamp: event.timestamp,
    };
    writeApi.writePoint(point);
  }

  /**
   * Query time-series data with flexible range and aggregation.
   * Requirement 17.3: Real-time data support.
   */
  async queryRange(options: RangeQueryOptions): Promise<InfluxQueryResult[]> {
    const queryApi = this.influxClient.getQueryApi(this.org);

    let flux = `from(bucket: "${this.bucket}")
  |> range(start: ${options.start}${options.stop ? `, stop: ${options.stop}` : ''})
  |> filter(fn: (r) => r._measurement == "${options.measurement}")
  |> filter(fn: (r) => r._field == "${options.field}")`;

    if (options.filters) {
      for (const [tag, value] of Object.entries(options.filters)) {
        flux += `\n  |> filter(fn: (r) => r["${tag}"] == "${value}")`;
      }
    }

    if (options.aggregateFn) {
      if (options.windowEvery) {
        flux += `\n  |> aggregateWindow(every: ${options.windowEvery}, fn: ${options.aggregateFn}, createEmpty: false)`;
      } else {
        flux += `\n  |> ${options.aggregateFn}()`;
      }
    }

    return queryApi.collectRows<InfluxQueryResult>(flux);
  }

  /**
   * Query average API response time over a time window.
   * Requirement 21.6: Response time tracking.
   */
  async getAverageResponseTime(
    service: string,
    windowStart = '-1h',
  ): Promise<number | null> {
    const results = await this.queryRange({
      start: windowStart,
      measurement: 'api_request',
      field: 'duration_ms',
      filters: { service },
      aggregateFn: 'mean',
    });
    if (results.length === 0) return null;
    return results[0]._value as number;
  }

  /**
   * Query self-healing events within a time range.
   * Requirement 4.6: Performance degradation detection.
   */
  async getSelfHealingEvents(
    organizationId: string,
    windowStart = '-24h',
  ): Promise<InfluxQueryResult[]> {
    return this.queryRange({
      start: windowStart,
      measurement: 'self_healing_event',
      field: 'attempts',
      filters: { organizationId },
    });
  }
}
