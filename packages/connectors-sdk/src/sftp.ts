/** SFTP / folder drop — pull CSV dumps healthcare & supply chain already produce. */

export type SftpConnectorConfig = {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  remotePath: string;
};

/**
 * SFTP connector — `fetchFileText` is injected (Identity uses ssh2-sftp-client).
 * File contents are expected to be CSV/enterprise text for normalize/parse.
 */
export function createSftpConnector(options: {
  config: SftpConnectorConfig;
  fetchFileText: (config: SftpConnectorConfig) => Promise<string>;
  parseCsv: (text: string) => {
    healthScore: number;
    connectedSystems: number;
    openAlerts: number;
    openDecisions: number;
    briefHighlight: string;
    timeline: { title: string; detail: string }[];
  };
  connectorName?: string;
}) {
  let config = options.config;
  const name = options.connectorName || 'SFTP / folder drop';

  return {
    id: 'sftp' as const,
    name,
    version: '0.1.0',
    type: 'file' as const,
    async configure(next: Partial<SftpConnectorConfig>) {
      config = { ...config, ...next };
    },
    async testConnection() {
      if (!config.host?.trim() || !config.username?.trim() || !config.remotePath?.trim()) {
        throw new Error('SFTP host, username, and remotePath are required');
      }
      if (!config.password && !config.privateKey) {
        throw new Error('SFTP password or privateKey is required');
      }
      const text = await options.fetchFileText(config);
      return Boolean(text?.length);
    },
    async sync() {
      try {
        const text = await options.fetchFileText(config);
        const payload = options.parseCsv(text);
        return {
          ok: true as const,
          summary: {
            connectorId: 'sftp',
            connectorName: name,
            ...payload,
            connectedSystems: Math.max(payload.connectedSystems, 1),
            briefHighlight:
              payload.briefHighlight ||
              `${name}: imported ${config.remotePath}`,
            timeline: [
              {
                title: 'SFTP / folder drop',
                detail: `Pulled ${config.remotePath} from ${config.host}`,
              },
              ...payload.timeline.slice(0, 10),
            ],
            syncedAt: new Date().toISOString(),
          },
          message: `Synced file from SFTP (${config.remotePath})`,
        };
      } catch (err) {
        return {
          ok: false as const,
          summary: {
            connectorId: 'sftp',
            connectorName: name,
            healthScore: 0,
            connectedSystems: 0,
            openAlerts: 0,
            openDecisions: 0,
            briefHighlight: '',
            timeline: [] as { title: string; detail: string }[],
          },
          message: err instanceof Error ? err.message : 'SFTP sync failed',
        };
      }
    },
    async disconnect() {},
  };
}
