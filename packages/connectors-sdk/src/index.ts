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

export type EnterprisePayload = {
  healthScore: number;
  connectedSystems: number;
  openAlerts: number;
  openDecisions: number;
  briefHighlight: string;
  timeline: { title: string; detail: string }[];
};

export function defineConnector(plugin: ConnectorPlugin): ConnectorPlugin {
  return plugin;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Normalize common REST JSON shapes into EIP enterprise fields (no code per system). */
export function normalizeEnterprisePayload(raw: unknown): EnterprisePayload {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root.enterprise && typeof root.enterprise === 'object'
        ? (root.enterprise as Record<string, unknown>)
        : root;

  const timelineRaw = data.timeline ?? data.events ?? data.activity ?? [];
  const timeline = Array.isArray(timelineRaw)
    ? timelineRaw
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const title = asString(row.title ?? row.name ?? row.event, '');
          const detail = asString(row.detail ?? row.description ?? row.message, '');
          if (!title) return null;
          return { title, detail: detail || title };
        })
        .filter((x): x is { title: string; detail: string } => Boolean(x))
        .slice(0, 12)
    : [];

  return {
    healthScore: Math.min(
      100,
      Math.max(0, asNumber(data.healthScore ?? data.health ?? data.score, 0)),
    ),
    connectedSystems: Math.max(
      0,
      asNumber(data.connectedSystems ?? data.systems ?? data.connected_systems, 0),
    ),
    openAlerts: Math.max(0, asNumber(data.openAlerts ?? data.alerts ?? data.open_alerts, 0)),
    openDecisions: Math.max(
      0,
      asNumber(data.openDecisions ?? data.decisions ?? data.open_decisions, 0),
    ),
    briefHighlight: asString(
      data.briefHighlight ?? data.brief ?? data.summary ?? data.message,
      'REST sync completed with no brief text.',
    ),
    timeline,
  };
}

/** Demo JSON / file-style connector — returns a fixed enterprise snapshot. */
export function createDemoJsonConnector(seed: EnterprisePayload): ConnectorPlugin {
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
          ...seed,
          syncedAt: new Date().toISOString(),
        },
        message: 'Synced demo enterprise snapshot',
      };
    },
    async disconnect() {},
  });
}

export type RestApiConnectorOptions = {
  endpoint: string;
  headers?: Record<string, string>;
  connectorName?: string;
  /** Injected fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

/**
 * REST API connector — IT points at any HTTPS (or same-origin) JSON URL.
 * Response is normalized into the Universal Enterprise Model without custom code.
 */
export function createRestApiConnector(options: RestApiConnectorOptions): ConnectorPlugin {
  let endpoint = options.endpoint;
  let headers = { ...(options.headers || {}) };
  const name = options.connectorName || 'REST API Systems';
  const fetchImpl = options.fetchImpl || fetch;

  return defineConnector({
    id: 'rest-api',
    name,
    version: '0.1.0',
    type: 'api',
    async configure(config) {
      if (typeof config.endpoint === 'string' && config.endpoint.trim()) {
        endpoint = config.endpoint.trim();
      }
      if (config.headers && typeof config.headers === 'object') {
        headers = { ...headers, ...(config.headers as Record<string, string>) };
      }
    },
    async testConnection() {
      const res = await fetchImpl(endpoint, { method: 'GET', headers });
      return res.ok;
    },
    async sync() {
      if (!endpoint) {
        return { ok: false, summary: emptyRestSummary(name), message: 'REST endpoint is required' };
      }
      try {
        const res = await fetchImpl(endpoint, {
          method: 'GET',
          headers: { Accept: 'application/json', ...headers },
        });
        if (!res.ok) {
          return {
            ok: false,
            summary: emptyRestSummary(name),
            message: `REST sync failed (${res.status})`,
          };
        }
        const raw = await res.json();
        const payload = normalizeEnterprisePayload(raw);
        return {
          ok: true,
          summary: {
            connectorId: 'rest-api',
            connectorName: name,
            ...payload,
            syncedAt: new Date().toISOString(),
          },
          message: `Synced from ${endpoint}`,
        };
      } catch (err) {
        return {
          ok: false,
          summary: emptyRestSummary(name),
          message: err instanceof Error ? err.message : 'REST sync failed',
        };
      }
    },
    async disconnect() {},
  });
}

function emptyRestSummary(name: string) {
  return {
    connectorId: 'rest-api',
    connectorName: name,
    healthScore: 0,
    connectedSystems: 0,
    openAlerts: 0,
    openDecisions: 0,
    briefHighlight: '',
    timeline: [] as { title: string; detail: string }[],
  };
}
