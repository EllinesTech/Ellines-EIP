import type { EnterpriseSummary } from '@ellines-eip/shared';

export type ConnectorType = 'api' | 'database' | 'file' | 'email' | 'event';

export interface ConnectorConfig {
  [key: string]: unknown;
}

export interface SyncResult {
  ok: boolean;
  summary: Omit<EnterpriseSummary, 'organizationId' | 'syncedAt' | 'status'> & {
    syncedAt?: string;
  };
  message?: string;
}

export interface ConnectorPlugin {
  id: string;
  name: string;
  version: string;
  type: ConnectorType;
  configure(config: ConnectorConfig): Promise<void>;
  testConnection(): Promise<boolean>;
  sync(since?: Date): Promise<SyncResult>;
  disconnect(): Promise<void>;
}

export function defineConnector(plugin: ConnectorPlugin): ConnectorPlugin {
  return plugin;
}

/** Demo JSON / file-style connector — returns a fixed enterprise snapshot. */
export function createDemoJsonConnector(seed: {
  healthScore: number;
  connectedSystems: number;
  openAlerts: number;
  openDecisions: number;
  briefHighlight: string;
  timeline: { title: string; detail: string }[];
}): ConnectorPlugin {
  return defineConnector({
    id: 'demo-json',
    name: 'Demo JSON Systems',
    version: '0.1.0',
    type: 'file',
    async configure() {},
    async testConnection() {
      return true;
    },
    async sync() {
      return {
        ok: true,
        summary: {
          connectorId: 'demo-json',
          connectorName: 'Demo JSON Systems',
          healthScore: seed.healthScore,
          connectedSystems: seed.connectedSystems,
          openAlerts: seed.openAlerts,
          openDecisions: seed.openDecisions,
          briefHighlight: seed.briefHighlight,
          timeline: seed.timeline,
          syncedAt: new Date().toISOString(),
        },
        message: 'Synced demo enterprise snapshot',
      };
    },
    async disconnect() {},
  });
}
