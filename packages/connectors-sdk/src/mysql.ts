import {
  assertReadOnlySql,
  rowsToEnterprisePayload,
} from './postgres';

export type MysqlQueryFn = (sql: string) => Promise<Record<string, unknown>[]>;

export type MysqlConnectorOptions = {
  sql: string;
  runQuery: MysqlQueryFn;
  connectorName?: string;
};

/**
 * MySQL connector — IT points at a read-only reporting DB / replica.
 * `runQuery` is injected so Cloudflare Workers never need a TCP driver.
 */
export function createMysqlConnector(options: MysqlConnectorOptions) {
  let sql = options.sql;
  const name = options.connectorName || 'MySQL (read-only)';

  return {
    id: 'mysql' as const,
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
            connectorId: 'mysql',
            connectorName: name,
            ...payload,
            syncedAt: new Date().toISOString(),
          },
          message: `Synced from MySQL (${rows.length} row(s))`,
        };
      } catch (err) {
        return {
          ok: false as const,
          summary: {
            connectorId: 'mysql',
            connectorName: name,
            healthScore: 0,
            connectedSystems: 0,
            openAlerts: 0,
            openDecisions: 0,
            briefHighlight: '',
            timeline: [] as { title: string; detail: string }[],
          },
          message: err instanceof Error ? err.message : 'MySQL sync failed',
        };
      }
    },
    async disconnect() {},
  };
}
