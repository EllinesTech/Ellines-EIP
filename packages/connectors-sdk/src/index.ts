import type { EnterpriseSummary, UemModel } from '@ellines-eip/shared';
import {
  inferUemFromMetrics,
  normalizeUemModel,
  packTimelineStorage,
  unpackTimelineStorage,
} from '@ellines-eip/shared';

export {
  parseOpenApiDocument,
  syncOpenApiRoutes,
  type OpenApiEndpoint,
  type ParsedOpenApi,
  type SelectedOpenApiRoute,
} from './openapi';
export {
  assertReadOnlySql,
  createPostgresConnector,
  rowsToEnterprisePayload,
  type PostgresConnectorOptions,
  type PostgresQueryFn,
} from './postgres';
export {
  createImapConnector,
  emailsToEnterprisePayload,
  type ImapConnectorConfig,
  type ImapMessageSummary,
} from './email-imap';
export {
  createSftpConnector,
  type SftpConnectorConfig,
} from './sftp';

export {
  inferUemFromMetrics,
  normalizeUemModel,
  packTimelineStorage,
  unpackTimelineStorage,
};

export type ConnectorType = 'api' | 'database' | 'file' | 'email' | 'event';

/** Typed capability exposed by any connector (API, DB, file, …). */
export type ConnectorCapability = {
  id: string;
  name: string;
  kind: 'read' | 'write' | 'sync';
  description?: string;
  inputs?: string[];
  outputs?: string[];
};

/** Persisted install config shape (secrets stored server-side per org). */
export type ConnectorInstallConfig = {
  endpoint?: string;
  headers?: Record<string, string>;
  authType?: 'none' | 'apiKey' | 'bearer' | 'basic';
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  csvText?: string;
  openApiDocument?: unknown;
  openApiBaseUrl?: string;
  selectedRoutes?: { method: string; path: string; capability?: string }[];
  connectionString?: string;
  sql?: string;
  fieldMap?: Record<string, string>;
  systemName?: string;
  /** IMAP */
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPassword?: string;
  imapMailbox?: string;
  imapSecure?: boolean;
  /** SFTP */
  sftpHost?: string;
  sftpPort?: number;
  sftpUsername?: string;
  sftpPassword?: string;
  sftpPrivateKey?: string;
  sftpRemotePath?: string;
};

export function buildAuthHeaders(config: ConnectorInstallConfig): Record<string, string> {
  const headers: Record<string, string> = { ...(config.headers || {}) };
  const auth = config.authType || 'none';
  if (auth === 'apiKey' && config.apiKey) {
    headers[config.apiKeyHeader || 'X-API-Key'] = config.apiKey;
  } else if (auth === 'bearer' && config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  } else if (auth === 'basic' && config.basicUser) {
    const raw = `${config.basicUser}:${config.basicPass || ''}`;
    const token =
      typeof Buffer !== 'undefined'
        ? Buffer.from(raw).toString('base64')
        : btoa(raw);
    headers.Authorization = `Basic ${token}`;
  }
  return headers;
}

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
  model?: UemModel | null;
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

  const healthScore = Math.min(
    100,
    Math.max(0, asNumber(data.healthScore ?? data.health ?? data.score, 0)),
  );
  const connectedSystems = Math.max(
    0,
    asNumber(data.connectedSystems ?? data.systems ?? data.connected_systems, 0),
  );
  const openAlerts = Math.max(0, asNumber(data.openAlerts ?? data.alerts ?? data.open_alerts, 0));
  const openDecisions = Math.max(
    0,
    asNumber(data.openDecisions ?? data.decisions ?? data.open_decisions, 0),
  );
  const briefHighlight = asString(
    data.briefHighlight ?? data.brief ?? data.summary ?? data.message,
    'REST sync completed with no brief text.',
  );

  const sourceSystem = asString(data.systemName ?? data.sourceSystem ?? data.system, '');
  let model: UemModel | null = null;
  if (data.model || data.uem || data.objects || data.counts) {
    model = normalizeUemModel(data, {
      sourceSystem: sourceSystem || undefined,
      fallbackCapabilities: ['read', 'sync'],
    });
  } else {
    model = inferUemFromMetrics({
      connectedSystems,
      openAlerts,
      openDecisions,
      sourceSystem: sourceSystem || undefined,
      timelineLength: timeline.length,
    });
  }

  return {
    healthScore,
    connectedSystems,
    openAlerts,
    openDecisions,
    briefHighlight,
    timeline,
    model,
  };
}

/** Persist-ready timeline JSON (events + UEM) for enterprise_snapshots.timeline */
export function toTimelineStorage(payload: EnterprisePayload) {
  return packTimelineStorage(payload.timeline, payload.model);
}

export function fromTimelineStorage(raw: unknown) {
  return unpackTimelineStorage(raw);
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
    model: null as UemModel | null,
  };
}

/** Parse CSV text (key/value or wide header row) into enterprise fields — no API required. */
export function parseCsvToEnterprisePayload(csvText: string): EnterprisePayload {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error('CSV is empty');
  }

  const split = (line: string) =>
    line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const map: Record<string, string> = {};

  const looksWide =
    header.includes('healthscore') ||
    header.includes('health') ||
    header.includes('connectedsystems') ||
    header.includes('systems');

  if (looksWide && lines.length >= 2) {
    const values = split(lines[1]);
    header.forEach((h, i) => {
      if (values[i] !== undefined) map[h] = values[i];
    });
  } else {
    for (const line of lines) {
      const cols = split(line);
      if (cols.length < 2) continue;
      const key = cols[0].toLowerCase();
      if (key === 'metric' || key === 'key' || key === 'field') continue;
      map[key] = cols.slice(1).join(',').trim();
    }
  }

  return normalizeEnterprisePayload({
    healthScore: map.healthscore ?? map.health ?? map.score,
    connectedSystems: map.connectedsystems ?? map.systems ?? map.connected_systems,
    openAlerts: map.openalerts ?? map.alerts ?? map.open_alerts,
    openDecisions: map.opendecisions ?? map.decisions ?? map.open_decisions,
    briefHighlight:
      map.briefhighlight ?? map.brief ?? map.summary ?? map.message ?? 'Imported from CSV file export.',
    timeline: [
      {
        title: 'CSV / file import',
        detail: 'Enterprise snapshot loaded from a file export — no vendor API required.',
      },
    ],
  });
}

export type CsvFileConnectorOptions = {
  csvText: string;
  connectorName?: string;
};

/**
 * CSV / File connector — for systems that only export files (ERP nightly dump, Excel, etc.).
 * IT pastes or uploads CSV; EIP normalizes into the Universal Enterprise Model.
 */
export function createCsvFileConnector(options: CsvFileConnectorOptions): ConnectorPlugin {
  let csvText = options.csvText;
  const name = options.connectorName || 'CSV / File Import';

  return defineConnector({
    id: 'csv-file',
    name,
    version: '0.1.0',
    type: 'file',
    async configure(config) {
      if (typeof config.csvText === 'string') csvText = config.csvText;
    },
    async testConnection() {
      return Boolean(csvText?.trim());
    },
    async sync() {
      try {
        const payload = parseCsvToEnterprisePayload(csvText);
        return {
          ok: true,
          summary: {
            connectorId: 'csv-file',
            connectorName: name,
            ...payload,
            syncedAt: new Date().toISOString(),
          },
          message: 'Synced from CSV / file export',
        };
      } catch (err) {
        return {
          ok: false,
          summary: {
            connectorId: 'csv-file',
            connectorName: name,
            healthScore: 0,
            connectedSystems: 0,
            openAlerts: 0,
            openDecisions: 0,
            briefHighlight: '',
            timeline: [],
          },
          message: err instanceof Error ? err.message : 'CSV sync failed',
        };
      }
    },
    async disconnect() {},
  });
}

/** Catalog of connection methods EIP supports or plans — API is only one path. */
export const CONNECTOR_CATALOG = [
  {
    id: 'rest-api',
    name: 'REST / HTTP API',
    type: 'api' as ConnectorType,
    status: 'available' as const,
    blurb: 'Pull JSON from any HTTPS endpoint when the system exposes one.',
  },
  {
    id: 'csv-file',
    name: 'CSV / File export',
    type: 'file' as ConnectorType,
    status: 'available' as const,
    blurb: 'No API needed — import nightly CSV/Excel dumps the business already produces.',
  },
  {
    id: 'demo-json',
    name: 'Demo JSON seed',
    type: 'file' as ConnectorType,
    status: 'available' as const,
    blurb: 'Built-in sample feed for demos and smoke tests.',
  },
  {
    id: 'openapi',
    name: 'OpenAPI / Swagger',
    type: 'api' as ConnectorType,
    status: 'available' as const,
    blurb: 'Upload the vendor OpenAPI file — EIP lists capabilities and syncs selected GETs.',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL (read-only)',
    type: 'database' as ConnectorType,
    status: 'available' as const,
    blurb: 'Connect straight to the system database when vendors will not ship an API.',
  },
  {
    id: 'sqlserver',
    name: 'SQL Server / MySQL',
    type: 'database' as ConnectorType,
    status: 'planned' as const,
    blurb: 'Read-only DB sync for common on-prem ERPs and HIS backends.',
  },
  {
    id: 'email-imap',
    name: 'Email (IMAP)',
    type: 'email' as ConnectorType,
    status: 'available' as const,
    blurb: 'Ingest reports and alerts mailed from legacy systems.',
  },
  {
    id: 'sftp',
    name: 'SFTP / folder drop',
    type: 'file' as ConnectorType,
    status: 'available' as const,
    blurb: 'Watch a folder or SFTP inbox — still the #1 pattern for healthcare and supply chain.',
  },
  {
    id: 'webhook',
    name: 'Webhooks / events',
    type: 'event' as ConnectorType,
    status: 'planned' as const,
    blurb: 'Receive pushes when a system can call EIP, without EIP polling.',
  },
] as const;
