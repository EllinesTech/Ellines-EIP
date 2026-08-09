/**
 * Integration tests — InfluxDB Metrics Service
 *
 * Tests time-series writes (system health, API requests, self-healing events)
 * and range queries including aggregations and filters.
 *
 * The InfluxDB client is mocked so these tests run without a live InfluxDB instance
 * while still validating the Flux query construction and data mapping.
 *
 * Requirements: 4.1, 4.6, 17.3, 21.6
 */

import {
  InfluxDbMetricsService,
  InfluxDBClient,
  InfluxWriteApi,
  InfluxQueryApi,
  InfluxQueryResult,
  MetricPoint,
} from './influxdb-metrics.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWriteApi(): InfluxWriteApi & { _points: MetricPoint[] } {
  const points: MetricPoint[] = [];
  return {
    _points: points,
    writePoint: jest.fn((p: MetricPoint) => points.push(p)),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeQueryApi(rows: InfluxQueryResult[] = []): InfluxQueryApi {
  return {
    collectRows: jest.fn().mockResolvedValue(rows),
  };
}

function makeInflux(
  writeApi?: ReturnType<typeof makeWriteApi>,
  queryApi?: InfluxQueryApi,
): InfluxDBClient & { _writeApi: ReturnType<typeof makeWriteApi> } {
  const wa = writeApi ?? makeWriteApi();
  const qa = queryApi ?? makeQueryApi();
  return {
    _writeApi: wa,
    getWriteApi: jest.fn().mockReturnValue(wa),
    getQueryApi: jest.fn().mockReturnValue(qa),
  };
}

function makeService(
  writeApi?: ReturnType<typeof makeWriteApi>,
  queryApi?: InfluxQueryApi,
) {
  const influx = makeInflux(writeApi, queryApi);
  const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');
  return { svc, influx };
}

// ─── System Health Writes ─────────────────────────────────────────────────────

describe('InfluxDbMetricsService — writeSystemHealth', () => {
  it('writes system_health measurement with correct tags and fields', () => {
    const { svc, influx } = makeService();

    svc.writeSystemHealth({
      service: 'identity',
      component: 'api',
      cpuPercent: 18.5,
      memoryMb: 512.0,
      uptimeSeconds: 86400,
    });

    const point = influx._writeApi._points[0];
    expect(point.measurement).toBe('system_health');
    expect(point.tags['service']).toBe('identity');
    expect(point.tags['component']).toBe('api');
    expect(point.fields['cpu_percent']).toBe(18.5);
    expect(point.fields['memory_mb']).toBe(512.0);
    expect(point.fields['uptime_seconds']).toBe(86400);
  });

  it('acquires a write API for the configured org and bucket', () => {
    const wa = makeWriteApi();
    const influx = makeInflux(wa);
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    svc.writeSystemHealth({ service: 'neo4j', component: 'database', cpuPercent: 5, memoryMb: 256, uptimeSeconds: 3600 });

    expect(influx.getWriteApi).toHaveBeenCalledWith('ellines_eip', 'platform_metrics', 'ms');
  });

  it('supports writing health snapshots for all monitored services', () => {
    const wa = makeWriteApi();
    const { svc } = makeService(wa);
    const services = ['identity', 'integration-hub', 'self-healing', 'neo4j', 'postgres', 'redis'];

    services.forEach((service) =>
      svc.writeSystemHealth({ service, component: 'api', cpuPercent: 10, memoryMb: 256, uptimeSeconds: 1000 }),
    );

    expect(wa._points).toHaveLength(services.length);
    services.forEach((service, i) => {
      expect(wa._points[i]?.tags['service']).toBe(service);
    });
  });

  it('passes custom timestamp to the point', () => {
    const { svc, influx } = makeService();
    const ts = new Date('2025-01-01T00:00:00Z');

    svc.writeSystemHealth({ service: 'identity', component: 'api', cpuPercent: 5, memoryMb: 128, uptimeSeconds: 60, timestamp: ts });

    expect(influx._writeApi._points[0]?.timestamp).toEqual(ts);
  });
});

// ─── API Request Writes ───────────────────────────────────────────────────────

describe('InfluxDbMetricsService — writeApiRequest', () => {
  it('writes api_request measurement with correct structure', () => {
    const { svc, influx } = makeService();

    svc.writeApiRequest({
      service: 'identity',
      endpoint: '/api/v1/auth/login',
      method: 'POST',
      status: 200,
      durationMs: 45.2,
      requestSize: 256,
      responseSize: 1024,
      organizationId: 'org_test',
    });

    const point = influx._writeApi._points[0];
    expect(point.measurement).toBe('api_request');
    expect(point.tags['service']).toBe('identity');
    expect(point.tags['endpoint']).toBe('/api/v1/auth/login');
    expect(point.tags['method']).toBe('POST');
    expect(point.tags['status']).toBe('200');
    expect(point.tags['organizationId']).toBe('org_test');
    expect(point.fields['duration_ms']).toBe(45.2);
    expect(point.fields['request_size']).toBe(256);
    expect(point.fields['response_size']).toBe(1024);
  });

  it('omits optional fields when not provided', () => {
    const { svc, influx } = makeService();

    svc.writeApiRequest({
      service: 'identity',
      endpoint: '/health',
      method: 'GET',
      status: 200,
      durationMs: 3.1,
    });

    const point = influx._writeApi._points[0];
    expect(point.fields['request_size']).toBeUndefined();
    expect(point.fields['response_size']).toBeUndefined();
    expect(point.tags['organizationId']).toBeUndefined();
  });

  it('records status as string tag (for Flux tag filtering)', () => {
    const { svc, influx } = makeService();

    svc.writeApiRequest({ service: 'identity', endpoint: '/api/v1', method: 'GET', status: 500, durationMs: 1500 });

    expect(typeof influx._writeApi._points[0]?.tags['status']).toBe('string');
    expect(influx._writeApi._points[0]?.tags['status']).toBe('500');
  });
});

// ─── Self-Healing Event Writes ────────────────────────────────────────────────

describe('InfluxDbMetricsService — writeSelfHealingEvent', () => {
  it('writes self_healing_event with all required tags and fields', () => {
    const { svc, influx } = makeService();

    svc.writeSelfHealingEvent({
      organizationId: 'org_test',
      errorCategory: 'database',
      severity: 'high',
      actionType: 'pool_reset',
      outcome: 'success',
      detectionLatencyMs: 125.3,
      remediationLatencyMs: 2340.5,
      confidenceScore: 0.92,
      attempts: 1,
    });

    const point = influx._writeApi._points[0];
    expect(point.measurement).toBe('self_healing_event');
    expect(point.tags['error_category']).toBe('database');
    expect(point.tags['severity']).toBe('high');
    expect(point.tags['action_type']).toBe('pool_reset');
    expect(point.tags['outcome']).toBe('success');
    expect(point.fields['detection_latency_ms']).toBe(125.3);
    expect(point.fields['remediation_latency_ms']).toBe(2340.5);
    expect(point.fields['confidence_score']).toBe(0.92);
    expect(point.fields['attempts']).toBe(1);
  });

  it('writes events for all severity levels', () => {
    const { svc, influx } = makeService();
    const severities = ['critical', 'high', 'medium', 'low'] as const;

    severities.forEach((severity) =>
      svc.writeSelfHealingEvent({
        organizationId: 'org_test',
        errorCategory: 'network',
        severity,
        actionType: 'restart',
        outcome: 'success',
        detectionLatencyMs: 50,
        remediationLatencyMs: 200,
        confidenceScore: 0.9,
        attempts: 1,
      }),
    );

    expect(influx._writeApi._points).toHaveLength(4);
    severities.forEach((severity, i) => {
      expect(influx._writeApi._points[i]?.tags['severity']).toBe(severity);
    });
  });

  it('records all remediation action types', () => {
    const { svc, influx } = makeService();
    const actions = ['restart', 'cache_clear', 'pool_reset', 'rate_limit', 'rollback'];

    actions.forEach((actionType) =>
      svc.writeSelfHealingEvent({
        organizationId: 'org_test',
        errorCategory: 'application',
        severity: 'medium',
        actionType,
        outcome: 'success',
        detectionLatencyMs: 100,
        remediationLatencyMs: 500,
        confidenceScore: 0.85,
        attempts: 1,
      }),
    );

    expect(influx._writeApi._points).toHaveLength(5);
    actions.forEach((action, i) => {
      expect(influx._writeApi._points[i]?.tags['action_type']).toBe(action);
    });
  });
});

// ─── Range Queries ────────────────────────────────────────────────────────────

describe('InfluxDbMetricsService — queryRange', () => {
  it('builds correct Flux query with measurement and field filters', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const { svc } = makeService(undefined, makeQueryApi());
    // Rebuild with our own collectRows mock
    const influx = makeInflux(undefined, { collectRows });
    const svc2 = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    await svc2.queryRange({
      start: '-1h',
      measurement: 'api_request',
      field: 'duration_ms',
    });

    const [query] = collectRows.mock.calls[0] as [string];
    expect(query).toContain('from(bucket: "platform_metrics")');
    expect(query).toContain('range(start: -1h)');
    expect(query).toContain('r._measurement == "api_request"');
    expect(query).toContain('r._field == "duration_ms"');
  });

  it('includes optional stop time in range when provided', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    await svc.queryRange({
      start: '-24h',
      stop: 'now()',
      measurement: 'system_health',
      field: 'cpu_percent',
    });

    const [query] = collectRows.mock.calls[0] as [string];
    expect(query).toContain('stop: now()');
  });

  it('appends tag filters to the Flux query', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    await svc.queryRange({
      start: '-1h',
      measurement: 'api_request',
      field: 'duration_ms',
      filters: { service: 'identity' },
    });

    const [query] = collectRows.mock.calls[0] as [string];
    expect(query).toContain('r["service"] == "identity"');
  });

  it('appends aggregate function when specified', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    await svc.queryRange({
      start: '-1h',
      measurement: 'api_request',
      field: 'duration_ms',
      aggregateFn: 'mean',
    });

    const [query] = collectRows.mock.calls[0] as [string];
    expect(query).toContain('|> mean()');
  });

  it('uses aggregateWindow when windowEvery is provided', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    await svc.queryRange({
      start: '-6h',
      measurement: 'system_health',
      field: 'cpu_percent',
      aggregateFn: 'mean',
      windowEvery: '5m',
    });

    const [query] = collectRows.mock.calls[0] as [string];
    expect(query).toContain('aggregateWindow(every: 5m, fn: mean');
  });

  it('returns parsed rows from the query API', async () => {
    const mockRows: InfluxQueryResult[] = [
      { _measurement: 'api_request', _field: 'duration_ms', _value: 45.2, _time: '2025-01-01T00:00:00Z' },
      { _measurement: 'api_request', _field: 'duration_ms', _value: 63.1, _time: '2025-01-01T00:01:00Z' },
    ];
    const { svc } = makeService(undefined, makeQueryApi(mockRows));
    // Need to rebuild with these rows
    const collectRows = jest.fn().mockResolvedValue(mockRows);
    const influx = makeInflux(undefined, { collectRows });
    const svc2 = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    const results = await svc2.queryRange({ start: '-1h', measurement: 'api_request', field: 'duration_ms' });

    expect(results).toHaveLength(2);
    expect(results[0]._value).toBe(45.2);
    expect(results[1]._value).toBe(63.1);
  });
});

// ─── High-Level Query Methods ─────────────────────────────────────────────────

describe('InfluxDbMetricsService — getAverageResponseTime', () => {
  it('returns the mean value from query results', async () => {
    const collectRows = jest.fn().mockResolvedValue([
      { _measurement: 'api_request', _field: 'duration_ms', _value: 52.4, _time: '' },
    ]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    const avg = await svc.getAverageResponseTime('identity');

    expect(avg).toBe(52.4);
  });

  it('returns null when no data in window', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    expect(await svc.getAverageResponseTime('identity', '-1h')).toBeNull();
  });

  it('filters by the specified service', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    await svc.getAverageResponseTime('integration-hub', '-30m');

    const [query] = collectRows.mock.calls[0] as [string];
    expect(query).toContain('"integration-hub"');
  });
});

describe('InfluxDbMetricsService — getSelfHealingEvents', () => {
  it('returns self-healing events filtered by organization', async () => {
    const mockEvents: InfluxQueryResult[] = [
      { _measurement: 'self_healing_event', _field: 'attempts', _value: 1, _time: '', organizationId: 'org_test' },
    ];
    const collectRows = jest.fn().mockResolvedValue(mockEvents);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    const events = await svc.getSelfHealingEvents('org_test');

    expect(events).toHaveLength(1);
    expect(events[0]._field).toBe('attempts');
  });

  it('passes the organizationId as a tag filter', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    await svc.getSelfHealingEvents('org_acme', '-7d');

    const [query] = collectRows.mock.calls[0] as [string];
    expect(query).toContain('"org_acme"');
    expect(query).toContain('-7d');
  });

  it('returns empty array when no events in window', async () => {
    const collectRows = jest.fn().mockResolvedValue([]);
    const influx = makeInflux(undefined, { collectRows });
    const svc = new InfluxDbMetricsService(influx, 'ellines_eip', 'platform_metrics');

    expect(await svc.getSelfHealingEvents('org_quiet', '-1h')).toEqual([]);
  });
});
