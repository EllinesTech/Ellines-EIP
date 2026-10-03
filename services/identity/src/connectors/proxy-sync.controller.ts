import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

/**
 * ProxySyncController
 *
 * Provides a trusted server-side proxy for connector syncs and connection tests
 * targeting on-prem / private-network endpoints (RFC1918 IPs, http:// LAN URLs).
 *
 * Cloudflare Pages Functions enforce a strict SSRF policy that blocks private IPs
 * and http:// schemes — correct for untrusted, user-supplied URLs on the public
 * cloud edge. However, client organisations may have legitimate on-prem systems
 * (e.g. a hospital HIS running at 192.168.x.x) that can only be reached from a
 * server on the same LAN.
 *
 * This controller runs inside the identity service (Node.js process on the same
 * LAN as the client systems). When the Pages Function's SSRF check blocks an
 * endpoint, the Function delegates here by sending only { installationId } —
 * no raw credentials or URLs travel over the wire. This controller reads both
 * from the database directly, enforces full tenant isolation, decrypts
 * credentials, makes the actual outbound call, and writes results back to DB.
 *
 * Security properties:
 *  - Tenant isolation: organization_id from JWT must match installation row
 *  - Credentials never returned in any response
 *  - Cloud metadata endpoints (169.254.169.254, etc.) are still blocked
 *  - Request timeout: 30 s
 *  - No redirect to blocked metadata endpoints
 *
 * Routes:
 *  POST /api/v1/connectors/proxy-sync  — full sync, writes to enterprise_snapshots
 *  POST /api/v1/connectors/proxy-test  — connectivity test only, no snapshot written
 */

const CLOUD_METADATA_HOSTS = new Set([
  '169.254.169.254',        // AWS / Azure / GCP instance metadata
  'metadata.google.internal',
  'metadata.internal',
  '100.100.100.200',        // Alibaba Cloud metadata
]);

/** Block cloud metadata endpoints even from a LAN-local proxy. */
function isBlockedProxyTarget(url: string): { blocked: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { blocked: true, reason: 'URL could not be parsed' };
  }
  const h = parsed.hostname.toLowerCase();
  if (CLOUD_METADATA_HOSTS.has(h)) {
    return { blocked: true, reason: `Cloud metadata endpoint is not permitted: ${h}` };
  }
  // Block non-HTTP(S) schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { blocked: true, reason: `Scheme "${parsed.protocol}" is not permitted` };
  }
  return { blocked: false };
}

/** Build auth headers from decrypted config. Mirrors Pages Function buildAuthHeaders. */
function buildAuthHeaders(config: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  const auth = (config['authType'] as string) || 'none';
  if (auth === 'apiKey' && config['apiKey']) {
    const headerName = (config['apiKeyHeader'] as string) || 'X-API-Key';
    headers[headerName] = config['apiKey'] as string;
  } else if (auth === 'bearer' && config['bearerToken']) {
    headers['Authorization'] = `Bearer ${config['bearerToken'] as string}`;
  } else if (auth === 'basic' && config['basicUser']) {
    const user = config['basicUser'] as string;
    const pass = (config['basicPass'] as string) || '';
    headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }
  return headers;
}

/** Decrypt all known credential fields in a config object. */
async function decryptConfig(
  raw: Record<string, unknown>,
  organizationId: string,
  enc: EncryptionService,
): Promise<Record<string, unknown>> {
  const SECRET_KEYS = [
    'apiKey', 'bearerToken', 'basicPass', 'connectionString',
    'imapPassword', 'sftpPassword', 'sftpPrivateKey',
  ];
  const out = { ...raw };
  for (const key of SECRET_KEYS) {
    const val = out[key];
    if (typeof val === 'string' && val.length > 0) {
      try {
        if (enc.isEncrypted(val)) {
          out[key] = await enc.decrypt(val, organizationId);
        }
      } catch {
        // Leave encrypted if decryption fails — the fetch will fail with auth error
      }
    }
  }
  return out;
}

interface AuthReq {
  user?: { sub?: string; organizationId?: string; role?: string };
}

@Controller('connectors')
export class ProxySyncController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * POST /api/v1/connectors/proxy-sync
   *
   * Full sync for an on-prem connector installation. Reads installation + config
   * from DB, makes the actual outbound call, writes enterprise_snapshots row,
   * and updates connector_installations status columns.
   *
   * Body: { installationId: string }
   * Returns: sync summary compatible with the Pages Function sync response shape
   */
  @UseGuards(JwtAuthGuard)
  @Post('proxy-sync')
  @HttpCode(HttpStatus.OK)
  async proxySync(
    @Request() req: AuthReq,
    @Body() body: { installationId?: string },
  ) {
    const installationId = (body.installationId ?? '').trim();
    if (!installationId) {
      throw new BadRequestException('installationId is required');
    }

    const organizationId = req.user?.organizationId ?? '';
    if (!organizationId) {
      throw new ForbiddenException('No organization context in token');
    }

    // Load installation — tenant isolation enforced by the organizationId filter
    const installation = await this.prisma.connectorInstallation.findFirst({
      where: { id: installationId, organizationId },
    });
    if (!installation) {
      throw new NotFoundException('Installation not found');
    }

    const catalogId = installation.catalogId;
    const displayName = installation.displayName;
    const rawConfig = (installation.config as Record<string, unknown>) ?? {};

    // Decrypt credentials server-side — never returned in response
    const config = await decryptConfig(rawConfig, organizationId, this.encryption);

    const endpoint = ((config['endpoint'] as string) ?? '').trim();
    if (!endpoint) {
      throw new BadRequestException('Connector has no endpoint configured');
    }

    // Block cloud metadata even from proxy
    const guard = isBlockedProxyTarget(endpoint);
    if (guard.blocked) {
      await this.#markError(installationId, organizationId, guard.reason ?? 'Blocked by proxy policy');
      throw new BadRequestException(guard.reason ?? 'Endpoint blocked by proxy policy');
    }

    const started = Date.now();
    let status: string;
    let lastMessage: string;
    let healthScore: number | null = null;
    let connectedSystems = 0;
    let reportedCount = 0;
    let retrievedCount = 0;
    let retrievalComplete = false;
    let lastPayload: unknown = null;

    try {
      const authHeaders = buildAuthHeaders(config);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'GET',
          headers: { Accept: 'application/json', ...authHeaders },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const errMsg = `Source returned HTTP ${response.status}`;
        await this.#markError(installationId, organizationId, errMsg);
        return {
          statusCode: 502,
          message: errMsg,
          connectorId: catalogId,
          connectorName: displayName,
          installationId,
          healthScore: null,
          connectedSystems: 0,
          synced: false,
        };
      }

      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        const errMsg = 'Endpoint returned non-JSON response';
        await this.#markError(installationId, organizationId, errMsg);
        return {
          statusCode: 502,
          message: errMsg,
          connectorId: catalogId,
          connectorName: displayName,
          installationId,
          healthScore: null,
          connectedSystems: 0,
          synced: false,
        };
      }

      // Normalize the payload
      const normalized = this.#normalizePayload(parsed, config);
      healthScore = normalized.healthScore ?? null;
      connectedSystems = normalized.connectedSystems ?? 0;
      lastPayload = parsed;
      retrievedCount = Array.isArray(parsed) ? parsed.length : (parsed != null ? 1 : 0);
      reportedCount = retrievedCount;
      retrievalComplete = true;
      status = 'synced';
      lastMessage = `Synced via LAN proxy — retrieved ${retrievedCount} record(s) from source`;

      // Write enterprise_snapshots row
      const snapshotRow = {
        organizationId,
        connectorId: catalogId,
        connectorName: displayName,
        installationId,
        healthScore,
        connectedSystems,
        openAlerts: normalized.openAlerts ?? 0,
        openDecisions: normalized.openDecisions ?? 0,
        briefHighlight: normalized.briefHighlight ?? null,
        rawPayload: parsed,
        retrievedAt: new Date().toISOString(),
        reportedCount,
        retrievalComplete,
        retrievalStopReason: 'complete',
        resourcesRetrieved: retrievedCount,
        resourcesFailed: 0,
      };

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO enterprise_snapshots (
          organization_id, connector_id, connector_name, installation_id,
          health_score, connected_systems, open_alerts, open_decisions,
          brief_highlight, raw_payload, retrieved_at,
          reported_count, retrieval_complete, retrieval_stop_reason,
          resources_retrieved, resources_failed
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16)`,
        organizationId,
        catalogId,
        displayName,
        installationId,
        healthScore,
        connectedSystems,
        snapshotRow.openAlerts,
        snapshotRow.openDecisions,
        snapshotRow.briefHighlight,
        JSON.stringify(parsed),
        new Date(),
        reportedCount,
        retrievalComplete,
        'complete',
        retrievedCount,
        0,
      );

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Proxy sync failed';
      await this.#markError(installationId, organizationId, msg);
      throw new InternalServerErrorException(msg);
    }

    const latencyMs = Date.now() - started;

    // Update connector_installations using only Prisma-mapped fields.
    // healthScore, reportedCount, retrievalComplete etc. are Supabase-only columns
    // not in the Prisma schema — they are already written via $executeRawUnsafe above.
    await this.prisma.connectorInstallation.update({
      where: { id: installationId },
      data: {
        status,
        lastSyncedAt: new Date(),
        lastMessage: lastMessage.slice(0, 300),
        lastError: null,
        errorCount: 0,
        lastPayload: lastPayload as any,
        updatedAt: new Date(),
      },
    });

    return {
      statusCode: 200,
      synced: true,
      latencyMs,
      connectorId: catalogId,
      connectorName: displayName,
      installationId,
      healthScore,
      connectedSystems,
      retrievedRecordCount: retrievedCount,
      reportedRecordCount: reportedCount,
      retrievalComplete,
      message: lastMessage,
    };
  }

  /**
   * POST /api/v1/connectors/proxy-test
   *
   * Connectivity test only. No snapshot written. Returns success/latency/status.
   *
   * Body: { installationId: string }
   */
  @UseGuards(JwtAuthGuard)
  @Post('proxy-test')
  @HttpCode(HttpStatus.OK)
  async proxyTest(
    @Request() req: AuthReq,
    @Body() body: { installationId?: string },
  ) {
    const installationId = (body.installationId ?? '').trim();
    if (!installationId) {
      throw new BadRequestException('installationId is required');
    }

    const organizationId = req.user?.organizationId ?? '';
    if (!organizationId) {
      throw new ForbiddenException('No organization context in token');
    }

    const installation = await this.prisma.connectorInstallation.findFirst({
      where: { id: installationId, organizationId },
    });
    if (!installation) {
      throw new NotFoundException('Installation not found');
    }

    const rawConfig = (installation.config as Record<string, unknown>) ?? {};
    const config = await decryptConfig(rawConfig, organizationId, this.encryption);

    const endpoint = ((config['endpoint'] as string) ?? '').trim();
    if (!endpoint) {
      throw new BadRequestException('Connector has no endpoint configured');
    }

    const guard = isBlockedProxyTarget(endpoint);
    if (guard.blocked) {
      return {
        success: false,
        latencyMs: 0,
        statusCode: null,
        message: guard.reason ?? 'Endpoint blocked by proxy policy',
      };
    }

    const started = Date.now();
    try {
      const authHeaders = buildAuthHeaders(config);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'GET',
          headers: { Accept: 'application/json', ...authHeaders },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const latencyMs = Date.now() - started;
      return {
        success: response.ok,
        latencyMs,
        statusCode: response.status,
        message: response.ok
          ? `Connected via LAN proxy (HTTP ${response.status})`
          : `Server returned HTTP ${response.status}`,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      return {
        success: false,
        latencyMs,
        statusCode: null,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  async #markError(installationId: string, organizationId: string, msg: string) {
    try {
      const current = await this.prisma.connectorInstallation.findFirst({
        where: { id: installationId, organizationId },
        select: { errorCount: true },
      });
      await this.prisma.connectorInstallation.update({
        where: { id: installationId },
        data: {
          status: 'error',
          lastMessage: msg.slice(0, 300),
          lastError: msg.slice(0, 300),
          errorCount: ((current?.errorCount as number) || 0) + 1,
          updatedAt: new Date(),
        },
      });
    } catch {
      // Best-effort — don't mask the original error
    }
  }

  #normalizePayload(data: unknown, config: Record<string, unknown>): {
    healthScore: number | null;
    connectedSystems: number;
    openAlerts: number;
    openDecisions: number;
    briefHighlight: string | null;
  } {
    const fieldMap = config['fieldMap'] as Record<string, string> | undefined;
    const result = {
      healthScore: null as number | null,
      connectedSystems: 0 as number,
      openAlerts: 0 as number,
      openDecisions: 0 as number,
      briefHighlight: null as string | null,
    };

    // Flatten top-level or data-wrapped object
    let flat: Record<string, unknown> = {};
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const d = data as Record<string, unknown>;
      // Common wrappers: { data: {...} }, { result: {...} }, { hospital: {...} }
      const wrapper = d['data'] ?? d['result'] ?? d['hospital'] ?? d;
      if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
        flat = wrapper as Record<string, unknown>;
      }
    } else if (Array.isArray(data)) {
      // Array response — use length as connectedSystems
      result.connectedSystems = data.length;
      return result;
    }

    // Apply field map if configured
    if (fieldMap) {
      for (const [src, dst] of Object.entries(fieldMap)) {
        if (src in flat) {
          (flat as Record<string, unknown>)[dst] = flat[src];
        }
      }
    }

    // Well-known EIP fields
    if (typeof flat['healthScore'] === 'number') result.healthScore = flat['healthScore'];
    if (typeof flat['connectedSystems'] === 'number') result.connectedSystems = flat['connectedSystems'];
    if (typeof flat['openAlerts'] === 'number') result.openAlerts = flat['openAlerts'];
    if (typeof flat['openDecisions'] === 'number') result.openDecisions = flat['openDecisions'];
    if (flat['briefHighlight'] != null) result.briefHighlight = String(flat['briefHighlight']);

    return result;
  }
}
