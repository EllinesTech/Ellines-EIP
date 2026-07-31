import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  assertReadOnlySql,
  buildAuthHeaders,
  createCsvFileConnector,
  createDemoJsonConnector,
  createImapConnector,
  createPostgresConnector,
  createRestApiConnector,
  createSftpConnector,
  normalizeEnterprisePayload,
  parseCsvToEnterprisePayload,
  parseOpenApiDocument,
  syncOpenApiRoutes,
  type ConnectorInstallConfig,
  type ImapMessageSummary,
} from '@ellines-eip/connectors-sdk';
import type {
  ConnectorInstallation,
  ConnectorPack,
  ConnectorStatus,
  EnterpriseSummary,
} from '@ellines-eip/shared';
import { ImapFlow } from 'imapflow';
import { Client } from 'pg';
import SftpClient from 'ssh2-sftp-client';
import { PrismaService } from '../prisma/prisma.service';
import demoSeed from './demo-enterprise.json';
import restSample from './rest-enterprise-sample.json';

const CSV_SAMPLE = `metric,value
healthScore,81
connectedSystems,4
openAlerts,1
openDecisions,3
briefHighlight,"Branch ops CSV export — no vendor API; file landed from nightly ERP dump."
`;

const SECRET_KEYS = [
  'apiKey',
  'bearerToken',
  'basicPass',
  'connectionString',
  'imapPassword',
  'sftpPassword',
  'sftpPrivateKey',
] as const;

const ALLOWED_CATALOG = [
  'rest-api',
  'openapi',
  'csv-file',
  'postgres',
  'demo-json',
  'email-imap',
  'sftp',
] as const;

function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config };
  for (const key of SECRET_KEYS) {
    if (typeof out[key] === 'string' && (out[key] as string).length > 0) {
      out[key] = '***';
    }
  }
  if (out.openApiDocument !== undefined) {
    out.openApiDocument = { _present: true };
  }
  return out;
}

function asInstallConfig(raw: unknown): ConnectorInstallConfig {
  return (raw && typeof raw === 'object' ? raw : {}) as ConnectorInstallConfig;
}

function mergeConfig(
  existing: ConnectorInstallConfig,
  patch: ConnectorInstallConfig,
): ConnectorInstallConfig {
  const next: ConnectorInstallConfig = { ...existing, ...patch };
  for (const key of SECRET_KEYS) {
    const v = patch[key];
    if (v === '***' || v === '' || v === undefined) {
      next[key] = existing[key];
    }
  }
  if (patch.openApiDocument && (patch.openApiDocument as { _present?: boolean })._present) {
    next.openApiDocument = existing.openApiDocument;
  }
  return next;
}

@Injectable()
export class EnterpriseService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string): Promise<EnterpriseSummary> {
    const snap = await this.prisma.enterpriseSnapshot.findUnique({
      where: { organizationId },
    });
    if (!snap) {
      return {
        organizationId,
        connectorId: 'demo-json',
        connectorName: 'Demo JSON Systems',
        healthScore: 0,
        connectedSystems: 0,
        openAlerts: 0,
        openDecisions: 0,
        briefHighlight: 'No connector sync yet. Open Connectors and run Sync now.',
        timeline: [],
        syncedAt: null,
        status: 'idle',
      };
    }
    return {
      organizationId: snap.organizationId,
      connectorId: snap.connectorId,
      connectorName: snap.connectorName,
      healthScore: snap.healthScore,
      connectedSystems: snap.connectedSystems,
      openAlerts: snap.openAlerts,
      openDecisions: snap.openDecisions,
      briefHighlight: snap.briefHighlight,
      timeline: snap.timeline as { title: string; detail: string }[],
      syncedAt: snap.syncedAt.toISOString(),
      status: 'synced',
    };
  }

  async listConnectors(organizationId: string): Promise<ConnectorStatus[]> {
    const snap = await this.prisma.enterpriseSnapshot.findUnique({
      where: { organizationId },
    });
    const lastAt = snap?.syncedAt.toISOString() ?? null;
    const activeId = snap?.connectorId ?? null;
    return [
      {
        id: 'demo-json',
        name: 'Demo JSON Systems',
        type: 'file',
        status: activeId === 'demo-json' ? 'synced' : 'idle',
        lastSyncedAt: activeId === 'demo-json' ? lastAt : null,
        message:
          activeId === 'demo-json'
            ? 'Last sync OK'
            : 'Built-in seed — Sync now for live KPIs',
      },
      {
        id: 'rest-api',
        name: 'REST API Systems',
        type: 'api',
        status: activeId === 'rest-api' ? 'synced' : 'idle',
        lastSyncedAt: activeId === 'rest-api' ? lastAt : null,
        message:
          activeId === 'rest-api'
            ? 'Last sync OK'
            : 'JSON HTTPS URL when the system exposes an API',
      },
      {
        id: 'openapi',
        name: 'OpenAPI / Swagger',
        type: 'api',
        status: activeId === 'openapi' ? 'synced' : 'idle',
        lastSyncedAt: activeId === 'openapi' ? lastAt : null,
        message:
          activeId === 'openapi'
            ? 'Last sync OK'
            : 'Upload OpenAPI — pick capabilities to sync',
      },
      {
        id: 'csv-file',
        name: 'CSV / File Import',
        type: 'file',
        status: activeId === 'csv-file' ? 'synced' : 'idle',
        lastSyncedAt: activeId === 'csv-file' ? lastAt : null,
        message:
          activeId === 'csv-file'
            ? 'Last sync OK'
            : 'No API needed — paste a CSV export from the business system',
      },
      {
        id: 'postgres',
        name: 'PostgreSQL (read-only)',
        type: 'database',
        status: activeId === 'postgres' ? 'synced' : 'idle',
        lastSyncedAt: activeId === 'postgres' ? lastAt : null,
        message:
          activeId === 'postgres'
            ? 'Last sync OK'
            : 'Reporting DB / replica when vendors will not ship an API',
      },
      {
        id: 'email-imap',
        name: 'Email (IMAP)',
        type: 'email',
        status: activeId === 'email-imap' ? 'synced' : 'idle',
        lastSyncedAt: activeId === 'email-imap' ? lastAt : null,
        message:
          activeId === 'email-imap'
            ? 'Last sync OK'
            : 'Ingest mailed reports when the prime system has no API',
      },
      {
        id: 'sftp',
        name: 'SFTP / folder drop',
        type: 'file',
        status: activeId === 'sftp' ? 'synced' : 'idle',
        lastSyncedAt: activeId === 'sftp' ? lastAt : null,
        message:
          activeId === 'sftp'
            ? 'Last sync OK'
            : 'Pull CSV dumps from SFTP — common in healthcare HIS',
      },
    ];
  }

  async listInstallations(organizationId: string): Promise<ConnectorInstallation[]> {
    const rows = await this.prisma.connectorInstallation.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toInstallationDto(r));
  }

  async createInstallation(
    organizationId: string,
    actorUserId: string,
    body: {
      catalogId: string;
      displayName: string;
      config?: ConnectorInstallConfig;
      packId?: string;
    },
  ): Promise<ConnectorInstallation> {
    const catalogId = body.catalogId?.trim();
    if (!catalogId) throw new BadRequestException('catalogId is required');
    if (!(ALLOWED_CATALOG as readonly string[]).includes(catalogId)) {
      throw new BadRequestException(`Unsupported catalogId: ${catalogId}`);
    }

    let config = body.config || {};
    let displayName = (body.displayName || '').trim() || catalogId;
    let packId: string | null = body.packId || null;

    if (packId) {
      const pack = await this.prisma.connectorPack.findFirst({
        where: { id: packId, published: true },
      });
      if (!pack) throw new NotFoundException('Connector pack not found');
      config = {
        ...(pack.templateConfig as ConnectorInstallConfig),
        ...config,
      };
      displayName = displayName || pack.name;
    }

    const row = await this.prisma.connectorInstallation.create({
      data: {
        organizationId,
        catalogId,
        displayName,
        config: config as object,
        status: 'draft',
        packId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorUserId,
        action: 'connector.install.create',
        resource: 'connector_installation',
        metadata: { id: row.id, catalogId },
      },
    });
    return this.toInstallationDto(row);
  }

  async updateInstallation(
    organizationId: string,
    id: string,
    patch: { displayName?: string; config?: ConnectorInstallConfig },
  ): Promise<ConnectorInstallation> {
    const row = await this.prisma.connectorInstallation.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Installation not found');
    const existing = asInstallConfig(row.config);
    const config = patch.config ? mergeConfig(existing, patch.config) : existing;
    const updated = await this.prisma.connectorInstallation.update({
      where: { id },
      data: {
        displayName: patch.displayName?.trim() || row.displayName,
        config: config as object,
      },
    });
    return this.toInstallationDto(updated);
  }

  async deleteInstallation(organizationId: string, id: string) {
    const row = await this.prisma.connectorInstallation.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Installation not found');
    await this.prisma.connectorInstallation.delete({ where: { id } });
    return { ok: true };
  }

  parseOpenApi(document: unknown) {
    try {
      return parseOpenApiDocument(document);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid OpenAPI');
    }
  }

  async testInstallation(organizationId: string, id: string) {
    const row = await this.prisma.connectorInstallation.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Installation not found');
    const config = asInstallConfig(row.config);

    try {
      const ok = await this.runTest(row.catalogId, config);
      const updated = await this.prisma.connectorInstallation.update({
        where: { id },
        data: {
          status: ok ? 'tested' : 'error',
          lastTestAt: new Date(),
          lastMessage: ok ? 'Connection test OK' : 'Connection test failed',
        },
      });
      return { ok, installation: this.toInstallationDto(updated) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      const updated = await this.prisma.connectorInstallation.update({
        where: { id },
        data: { status: 'error', lastTestAt: new Date(), lastMessage: message },
      });
      return { ok: false, message, installation: this.toInstallationDto(updated) };
    }
  }

  async syncInstallation(organizationId: string, actorUserId: string, id: string) {
    const row = await this.prisma.connectorInstallation.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Installation not found');
    const config = asInstallConfig(row.config);
    const summary = await this.runSync(row.catalogId, config, row.displayName);
    const persisted = await this.persistSync(
      organizationId,
      actorUserId,
      { ...summary, connectorId: row.catalogId, connectorName: row.displayName },
      row.catalogId,
    );
    await this.prisma.connectorInstallation.update({
      where: { id },
      data: {
        status: 'synced',
        lastSyncedAt: new Date(),
        lastMessage: `Synced — health ${persisted.healthScore}`,
      },
    });
    return persisted;
  }

  async syncConnector(
    organizationId: string,
    actorUserId: string,
    connectorId: string,
    options?: ConnectorInstallConfig,
  ) {
    if (connectorId === 'demo-json') {
      const connector = createDemoJsonConnector(demoSeed);
      const result = await connector.sync();
      if (!result.ok) {
        throw new ServiceUnavailableException(result.message || 'Sync failed');
      }
      return this.persistSync(organizationId, actorUserId, result.summary, connectorId);
    }

    const config = options || {};
    const summary = await this.runSync(connectorId, config, undefined);
    return this.persistSync(organizationId, actorUserId, summary, connectorId);
  }

  async listPacks(publishedOnly = false): Promise<ConnectorPack[]> {
    const rows = await this.prisma.connectorPack.findMany({
      where: publishedOnly ? { published: true } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toPackDto(r));
  }

  async createPack(
    actorEmail: string,
    body: {
      slug: string;
      name: string;
      description?: string;
      catalogId: string;
      templateConfig?: ConnectorInstallConfig;
      fromInstallationId?: string;
      organizationId?: string;
      published?: boolean;
    },
  ): Promise<ConnectorPack> {
    const slug = body.slug?.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!slug) throw new BadRequestException('slug is required');
    if (!body.name?.trim()) throw new BadRequestException('name is required');

    let catalogId = body.catalogId;
    let templateConfig: ConnectorInstallConfig = body.templateConfig || {};

    if (body.fromInstallationId && body.organizationId) {
      const inst = await this.prisma.connectorInstallation.findFirst({
        where: { id: body.fromInstallationId, organizationId: body.organizationId },
      });
      if (!inst) throw new NotFoundException('Installation not found');
      catalogId = inst.catalogId;
      const cfg = asInstallConfig(inst.config);
      templateConfig = redactConfig({ ...cfg }) as ConnectorInstallConfig;
      for (const key of SECRET_KEYS) delete templateConfig[key];
      delete templateConfig.openApiDocument;
    }

    if (!catalogId) throw new BadRequestException('catalogId is required');

    try {
      const row = await this.prisma.connectorPack.create({
        data: {
          slug,
          name: body.name.trim(),
          description: body.description?.trim() || '',
          catalogId,
          templateConfig: templateConfig as object,
          published: body.published !== false,
          createdByEmail: actorEmail,
        },
      });
      return this.toPackDto(row);
    } catch {
      throw new BadRequestException('Pack slug already exists');
    }
  }

  private async runTest(catalogId: string, config: ConnectorInstallConfig): Promise<boolean> {
    if (catalogId === 'demo-json') return true;
    if (catalogId === 'csv-file') {
      return Boolean((config.csvText || CSV_SAMPLE).trim());
    }
    if (catalogId === 'rest-api') {
      const endpoint = (config.endpoint || '').trim();
      if (!endpoint || endpoint.includes('rest-sample') || endpoint === 'sample') return true;
      const connector = createRestApiConnector({
        endpoint,
        headers: buildAuthHeaders(config),
      });
      return connector.testConnection();
    }
    if (catalogId === 'openapi') {
      if (!config.openApiDocument) throw new BadRequestException('OpenAPI document required');
      parseOpenApiDocument(config.openApiDocument);
      const base = (config.openApiBaseUrl || '').trim();
      if (!base) return true;
      const res = await fetch(base, { method: 'GET', headers: buildAuthHeaders(config) });
      return res.ok || res.status === 404 || res.status === 401 || res.status === 403;
    }
    if (catalogId === 'postgres') {
      if (!config.connectionString?.trim()) {
        throw new BadRequestException('connectionString is required');
      }
      assertReadOnlySql(config.sql || 'SELECT 1');
      await this.pgQuery(config.connectionString, 'SELECT 1 AS ok');
      return true;
    }
    if (catalogId === 'email-imap') {
      const connector = createImapConnector({
        config: {
          host: config.imapHost || '',
          port: config.imapPort,
          user: config.imapUser || '',
          password: config.imapPassword || '',
          mailbox: config.imapMailbox,
          secure: config.imapSecure,
          limit: 1,
        },
        fetchMail: (c) => this.fetchImapMail(c),
      });
      return connector.testConnection();
    }
    if (catalogId === 'sftp') {
      const connector = createSftpConnector({
        config: {
          host: config.sftpHost || '',
          port: config.sftpPort,
          username: config.sftpUsername || '',
          password: config.sftpPassword,
          privateKey: config.sftpPrivateKey,
          remotePath: config.sftpRemotePath || '',
        },
        fetchFileText: (c) => this.fetchSftpFile(c),
        parseCsv: parseCsvToEnterprisePayload,
      });
      return connector.testConnection();
    }
    throw new NotFoundException('Unknown connector');
  }

  private async runSync(
    catalogId: string,
    config: ConnectorInstallConfig,
    displayName?: string,
  ) {
    if (catalogId === 'demo-json') {
      const connector = createDemoJsonConnector(demoSeed);
      const result = await connector.sync();
      if (!result.ok) throw new ServiceUnavailableException(result.message || 'Sync failed');
      return result.summary;
    }

    if (catalogId === 'rest-api') {
      const endpoint = (config.endpoint || '').trim();
      const useSample =
        !endpoint ||
        endpoint.includes('/api/v1/connectors/rest-sample') ||
        endpoint === 'sample';
      if (useSample) {
        const payload = normalizeEnterprisePayload(restSample);
        return {
          connectorId: 'rest-api',
          connectorName: displayName || 'REST API Systems',
          ...payload,
          syncedAt: new Date().toISOString(),
        };
      }
      let parsed: URL;
      try {
        parsed = new URL(endpoint);
      } catch {
        throw new BadRequestException('Invalid REST endpoint URL');
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new BadRequestException('REST endpoint must be http(s)');
      }
      const connector = createRestApiConnector({
        endpoint: parsed.toString(),
        headers: buildAuthHeaders(config),
        connectorName: displayName || config.systemName || 'REST API Systems',
      });
      const result = await connector.sync();
      if (!result.ok) throw new ServiceUnavailableException(result.message || 'REST sync failed');
      return result.summary;
    }

    if (catalogId === 'openapi') {
      if (!config.openApiDocument && !config.openApiBaseUrl) {
        throw new BadRequestException('OpenAPI document or base URL required');
      }
      let baseUrl = (config.openApiBaseUrl || '').trim();
      let systemName = displayName || config.systemName || 'OpenAPI System';
      if (config.openApiDocument) {
        const parsed = parseOpenApiDocument(config.openApiDocument);
        if (!baseUrl) baseUrl = parsed.baseUrl;
        systemName = displayName || config.systemName || parsed.title;
      }
      const routes = config.selectedRoutes?.length
        ? config.selectedRoutes
        : config.openApiDocument
          ? parseOpenApiDocument(config.openApiDocument)
              .endpoints.filter((e) => e.selectable)
              .slice(0, 5)
              .map((e) => ({ method: e.method, path: e.path, capability: e.capability }))
          : [];
      const result = await syncOpenApiRoutes({
        baseUrl,
        routes,
        headers: buildAuthHeaders(config),
        systemName,
        normalize: normalizeEnterprisePayload,
      });
      if (!result.ok) throw new ServiceUnavailableException(result.message);
      return {
        connectorId: 'openapi',
        connectorName: systemName,
        ...result.payload,
        syncedAt: new Date().toISOString(),
      };
    }

    if (catalogId === 'csv-file') {
      const connector = createCsvFileConnector({
        csvText: (config.csvText && config.csvText.trim()) || CSV_SAMPLE,
        connectorName: displayName || 'CSV / File Import',
      });
      const result = await connector.sync();
      if (!result.ok) throw new BadRequestException(result.message || 'CSV sync failed');
      return result.summary;
    }

    if (catalogId === 'postgres') {
      if (!config.connectionString?.trim()) {
        throw new BadRequestException('connectionString is required');
      }
      const sql = config.sql?.trim() || 'SELECT 1 AS healthScore, 1 AS connectedSystems';
      const connector = createPostgresConnector({
        sql,
        connectorName: displayName || config.systemName || 'PostgreSQL (read-only)',
        runQuery: (q) => this.pgQuery(config.connectionString!, q),
      });
      const result = await connector.sync();
      if (!result.ok) throw new ServiceUnavailableException(result.message || 'Postgres sync failed');
      return result.summary;
    }

    if (catalogId === 'email-imap') {
      const connector = createImapConnector({
        config: {
          host: config.imapHost || '',
          port: config.imapPort,
          user: config.imapUser || '',
          password: config.imapPassword || '',
          mailbox: config.imapMailbox,
          secure: config.imapSecure,
          limit: 20,
        },
        connectorName: displayName || config.systemName || 'Email (IMAP)',
        fetchMail: (c) => this.fetchImapMail(c),
      });
      const result = await connector.sync();
      if (!result.ok) throw new ServiceUnavailableException(result.message || 'IMAP sync failed');
      return result.summary;
    }

    if (catalogId === 'sftp') {
      const connector = createSftpConnector({
        config: {
          host: config.sftpHost || '',
          port: config.sftpPort,
          username: config.sftpUsername || '',
          password: config.sftpPassword,
          privateKey: config.sftpPrivateKey,
          remotePath: config.sftpRemotePath || '',
        },
        connectorName: displayName || config.systemName || 'SFTP / folder drop',
        fetchFileText: (c) => this.fetchSftpFile(c),
        parseCsv: parseCsvToEnterprisePayload,
      });
      const result = await connector.sync();
      if (!result.ok) throw new ServiceUnavailableException(result.message || 'SFTP sync failed');
      return result.summary;
    }

    throw new NotFoundException('Unknown connector');
  }

  private async fetchImapMail(config: {
    host: string;
    port?: number;
    user: string;
    password: string;
    mailbox?: string;
    secure?: boolean;
    limit?: number;
  }): Promise<ImapMessageSummary[]> {
    if (!config.host?.trim() || !config.user?.trim() || !config.password) {
      throw new BadRequestException('IMAP host, user, and password are required');
    }
    const client = new ImapFlow({
      host: config.host.trim(),
      port: config.port || (config.secure === false ? 143 : 993),
      secure: config.secure !== false,
      auth: { user: config.user, pass: config.password },
      logger: false,
    });
    await client.connect();
    try {
      const mailbox = config.mailbox || 'INBOX';
      const lock = await client.getMailboxLock(mailbox);
      try {
        const limit = Math.min(50, Math.max(1, config.limit ?? 20));
        const exists =
          client.mailbox && typeof client.mailbox === 'object' && 'exists' in client.mailbox
            ? Number((client.mailbox as { exists: number }).exists)
            : 0;
        if (!exists) return [];
        const from = Math.max(1, exists - limit + 1);
        const messages: ImapMessageSummary[] = [];
        for await (const msg of client.fetch(`${from}:*`, { envelope: true })) {
          const env = msg.envelope;
          const subject = env?.subject || '(no subject)';
          const fromAddr = env?.from?.[0]
            ? `${env.from[0].name || ''} <${env.from[0].address || ''}>`.trim()
            : '';
          const date = env?.date ? new Date(env.date).toISOString() : '';
          messages.push({
            subject,
            from: fromAddr,
            date,
            snippet: subject,
          });
        }
        return messages.reverse().slice(0, limit);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private async fetchSftpFile(config: {
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string;
    remotePath: string;
  }): Promise<string> {
    if (!config.host?.trim() || !config.username?.trim() || !config.remotePath?.trim()) {
      throw new BadRequestException('SFTP host, username, and remotePath are required');
    }
    if (!config.password && !config.privateKey) {
      throw new BadRequestException('SFTP password or privateKey is required');
    }
    const sftp = new SftpClient();
    try {
      await sftp.connect({
        host: config.host.trim(),
        port: config.port || 22,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        readyTimeout: 12000,
      });
      const buf = await sftp.get(config.remotePath);
      if (Buffer.isBuffer(buf)) return buf.toString('utf8');
      if (typeof buf === 'string') return buf;
      throw new Error('Unexpected SFTP file payload');
    } finally {
      await sftp.end().catch(() => undefined);
    }
  }

  private async pgQuery(
    connectionString: string,
    sql: string,
  ): Promise<Record<string, unknown>[]> {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 8000,
    });
    await client.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL statement_timeout = 8000');
      const res = await client.query(sql);
      await client.query('COMMIT');
      return res.rows as Record<string, unknown>[];
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private toInstallationDto(row: {
    id: string;
    organizationId: string;
    catalogId: string;
    displayName: string;
    config: unknown;
    status: string;
    lastTestAt: Date | null;
    lastSyncedAt: Date | null;
    lastMessage: string | null;
    packId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ConnectorInstallation {
    return {
      id: row.id,
      organizationId: row.organizationId,
      catalogId: row.catalogId,
      displayName: row.displayName,
      status: row.status as ConnectorInstallation['status'],
      lastTestAt: row.lastTestAt?.toISOString() ?? null,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastMessage: row.lastMessage,
      packId: row.packId,
      config: redactConfig(asInstallConfig(row.config) as Record<string, unknown>),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPackDto(row: {
    id: string;
    slug: string;
    name: string;
    description: string;
    catalogId: string;
    templateConfig: unknown;
    published: boolean;
    createdByEmail: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ConnectorPack {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      catalogId: row.catalogId,
      templateConfig: redactConfig(
        (row.templateConfig || {}) as Record<string, unknown>,
      ),
      published: row.published,
      createdByEmail: row.createdByEmail,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async persistSync(
    organizationId: string,
    actorUserId: string,
    s: {
      connectorId: string;
      connectorName: string;
      healthScore: number;
      connectedSystems: number;
      openAlerts: number;
      openDecisions: number;
      briefHighlight: string;
      timeline: { title: string; detail: string }[];
      syncedAt?: string;
    },
    connectorId: string,
  ) {
    const syncedAt = new Date(s.syncedAt || Date.now());
    const snap = await this.prisma.enterpriseSnapshot.upsert({
      where: { organizationId },
      create: {
        organizationId,
        connectorId: s.connectorId,
        connectorName: s.connectorName,
        healthScore: s.healthScore,
        connectedSystems: s.connectedSystems,
        openAlerts: s.openAlerts,
        openDecisions: s.openDecisions,
        briefHighlight: s.briefHighlight,
        timeline: s.timeline,
        syncedAt,
      },
      update: {
        connectorId: s.connectorId,
        connectorName: s.connectorName,
        healthScore: s.healthScore,
        connectedSystems: s.connectedSystems,
        openAlerts: s.openAlerts,
        openDecisions: s.openDecisions,
        briefHighlight: s.briefHighlight,
        timeline: s.timeline,
        syncedAt,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorUserId,
        action: 'connector.sync',
        resource: 'enterprise_snapshot',
        metadata: { connectorId },
      },
    });
    return {
      organizationId: snap.organizationId,
      connectorId: snap.connectorId,
      connectorName: snap.connectorName,
      healthScore: snap.healthScore,
      connectedSystems: snap.connectedSystems,
      openAlerts: snap.openAlerts,
      openDecisions: snap.openDecisions,
      briefHighlight: snap.briefHighlight,
      timeline: snap.timeline as { title: string; detail: string }[],
      syncedAt: snap.syncedAt.toISOString(),
      status: 'synced' as const,
    };
  }
}
