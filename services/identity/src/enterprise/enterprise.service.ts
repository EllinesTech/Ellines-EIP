import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createDemoJsonConnector,
  createRestApiConnector,
  normalizeEnterprisePayload,
} from '@ellines-eip/connectors-sdk';
import type { ConnectorStatus, EnterpriseSummary } from '@ellines-eip/shared';
import { PrismaService } from '../prisma/prisma.service';
import demoSeed from './demo-enterprise.json';
import restSample from './rest-enterprise-sample.json';

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
            : 'Point at any JSON REST URL (sample included)',
      },
    ];
  }

  async syncConnector(
    organizationId: string,
    actorUserId: string,
    connectorId: string,
    options?: { endpoint?: string; headers?: Record<string, string> },
  ) {
    if (connectorId === 'demo-json') {
      const connector = createDemoJsonConnector(demoSeed);
      const result = await connector.sync();
      if (!result.ok) {
        throw new ServiceUnavailableException(result.message || 'Sync failed');
      }
      return this.persistSync(organizationId, actorUserId, result.summary, connectorId);
    }

    if (connectorId === 'rest-api') {
      const endpoint = (options?.endpoint || '').trim();
      const useSample =
        !endpoint ||
        endpoint.includes('/api/v1/connectors/rest-sample') ||
        endpoint === 'sample';

      if (useSample) {
        const payload = normalizeEnterprisePayload(restSample);
        return this.persistSync(
          organizationId,
          actorUserId,
          {
            connectorId: 'rest-api',
            connectorName: 'REST API Systems',
            ...payload,
            syncedAt: new Date().toISOString(),
          },
          connectorId,
        );
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
        headers: options?.headers,
      });
      const result = await connector.sync();
      if (!result.ok) {
        throw new ServiceUnavailableException(result.message || 'REST sync failed');
      }
      return this.persistSync(organizationId, actorUserId, result.summary, connectorId);
    }

    throw new NotFoundException('Unknown connector');
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
