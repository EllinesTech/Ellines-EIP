import {
  assertReadOnlySql,
  rowsToEnterprisePayload,
} from './postgres';

export type SqlServerQueryFn = (sql: string) => Promise<Record<string, unknown>[]>;

export type SqlServerConnectorOptions = {
  sql: string;
  runQuery: SqlServerQueryFn;
  connectorName?: string;
};

/**
 * SQL Server connector — IT points at a read-only reporting DB / replica.
 * `runQuery` is injected so Cloudflare Workers never need a TCP driver.
 * Test uses SELECT 1 (T-SQL has no LIMIT); sync runs the configured SELECT.
 */
export function createSqlServerConnector(options: SqlServerConnectorOptions) {
  let sql = options.sql;
  const name = options.connectorName || 'SQL Server (read-only)';

  return {
    id: 'sqlserver' as const,
    name,
    version: '0.1.0',
    type: 'database' as const,
    async configure(config: { sql?: string }) {
      if (typeof config.sql === 'string') sql = config.sql;
    },
    async testConnection() {
      assertReadOnlySql(sql);
      const rows = await options.runQuery('SELECT 1 AS ok');
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
            connectorId: 'sqlserver',
            connectorName: name,
            ...payload,
            syncedAt: new Date().toISOString(),
          },
          message: `Synced from SQL Server (${rows.length} row(s))`,
        };
      } catch (err) {
        return {
          ok: false as const,
          summary: {
            connectorId: 'sqlserver',
            connectorName: name,
            healthScore: 0,
            connectedSystems: 0,
            openAlerts: 0,
            openDecisions: 0,
            briefHighlight: '',
            timeline: [] as { title: string; detail: string }[],
          },
          message: err instanceof Error ? err.message : 'SQL Server sync failed',
        };
      }
    },
    async disconnect() {},
  };
}
