import {
  inferUemFromMetrics,
  type UemModel,
} from '@ellines-eip/shared';

/** Read-only PostgreSQL helpers — no vendor API required. */

export function assertReadOnlySql(sql: string): string {
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
  if (!cleaned) throw new Error('SQL query is required');
  if (!/^\s*WITH\b/i.test(cleaned) && !/^\s*SELECT\b/i.test(cleaned)) {
    throw new Error('Only SELECT (or WITH … SELECT) queries are allowed');
  }
  if (
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|EXECUTE|MERGE)\b/i.test(
      cleaned,
    )
  ) {
    throw new Error('Write or DDL statements are not allowed');
  }
  return cleaned;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * Map SQL result rows into enterprise fields.
 * Supports: one wide metrics row, or key/value rows (metric,value).
 */
export function rowsToEnterprisePayload(
  rows: Record<string, unknown>[],
  systemName = 'PostgreSQL',
): {
  healthScore: number;
  connectedSystems: number;
  openAlerts: number;
  openDecisions: number;
  briefHighlight: string;
  timeline: { title: string; detail: string }[];
  model: UemModel;
} {
  if (!rows.length) {
    return {
      healthScore: 0,
      connectedSystems: 1,
      openAlerts: 0,
      openDecisions: 0,
      briefHighlight: `${systemName}: query returned no rows.`,
      timeline: [{ title: 'PostgreSQL sync', detail: 'Empty result set' }],
      model: inferUemFromMetrics({
        connectedSystems: 1,
        sourceSystem: systemName,
        timelineLength: 1,
      }),
    };
  }

  const first = rows[0];
  const keys = Object.keys(first).map((k) => k.toLowerCase());
  const looksKv =
    rows.length > 1 &&
    (keys.includes('metric') || keys.includes('key') || keys.includes('field')) &&
    (keys.includes('value') || keys.includes('val'));

  const map: Record<string, unknown> = {};
  if (looksKv) {
    for (const row of rows) {
      const key = asString(row.metric ?? row.key ?? row.field ?? row.METRIC ?? row.KEY, '').toLowerCase();
      const value = row.value ?? row.val ?? row.VALUE ?? row.VAL;
      if (key) map[key] = value;
    }
  } else {
    for (const [k, v] of Object.entries(first)) {
      map[k.toLowerCase()] = v;
    }
  }

  const payload = {
    healthScore: Math.min(
      100,
      Math.max(0, asNumber(map.healthscore ?? map.health ?? map.score, 65)),
    ),
    connectedSystems: Math.max(
      1,
      asNumber(map.connectedsystems ?? map.systems ?? map.connected_systems, 1),
    ),
    openAlerts: Math.max(0, asNumber(map.openalerts ?? map.alerts ?? map.open_alerts, 0)),
    openDecisions: Math.max(
      0,
      asNumber(map.opendecisions ?? map.decisions ?? map.open_decisions, 0),
    ),
    briefHighlight: asString(
      map.briefhighlight ?? map.brief ?? map.summary ?? map.message,
      `${systemName}: read-only SQL sync (${rows.length} row(s)).`,
    ),
    timeline: [
      {
        title: 'PostgreSQL read-only sync',
        detail: `${rows.length} row(s) from reporting query — no vendor API required.`,
      },
    ],
  };
  return {
    ...payload,
    model: inferUemFromMetrics({
      connectedSystems: payload.connectedSystems,
      openAlerts: payload.openAlerts,
      openDecisions: payload.openDecisions,
      sourceSystem: systemName,
      timelineLength: payload.timeline.length,
    }),
  };
}

export type PostgresQueryFn = (sql: string) => Promise<Record<string, unknown>[]>;

export type PostgresConnectorOptions = {
  sql: string;
  runQuery: PostgresQueryFn;
  connectorName?: string;
};

/**
 * PostgreSQL connector — IT points at a read-only reporting DB / replica.
 * `runQuery` is injected so Cloudflare Workers never need a TCP driver.
 */
export function createPostgresConnector(options: PostgresConnectorOptions) {
  let sql = options.sql;
  const name = options.connectorName || 'PostgreSQL (read-only)';

  return {
    id: 'postgres' as const,
    name,
    version: '0.1.0',
    type: 'database' as const,
    async configure(config: { sql?: string }) {
      if (typeof config.sql === 'string') sql = config.sql;
    },
    async testConnection() {
      assertReadOnlySql(sql);
      const rows = await options.runQuery(`${assertReadOnlySql(sql)} LIMIT 1`);
      return Array.isArray(rows);
    },
    async sync() {
      try {
        const safe = assertReadOnlySql(sql);
        const rows = await options.runQuery(safe);
        const payload = rowsToEnterprisePayload(rows, name);
        return {
          ok: true as const,
          summary: {
            connectorId: 'postgres',
            connectorName: name,
            ...payload,
            syncedAt: new Date().toISOString(),
          },
          message: `Synced from PostgreSQL (${rows.length} row(s))`,
        };
      } catch (err) {
        return {
          ok: false as const,
          summary: {
            connectorId: 'postgres',
            connectorName: name,
            healthScore: 0,
            connectedSystems: 0,
            openAlerts: 0,
            openDecisions: 0,
            briefHighlight: '',
            timeline: [] as { title: string; detail: string }[],
          },
          message: err instanceof Error ? err.message : 'PostgreSQL sync failed',
        };
      }
    },
    async disconnect() {},
  };
}
