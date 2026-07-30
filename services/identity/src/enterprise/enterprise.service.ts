import { Injectable, NotFoundException } from '@nestjs/common';
import { createDemoJsonConnector } from '@ellines-eip/connectors-sdk';
import type { ConnectorStatus, EnterpriseSummary } from '@ellines-eip/shared';
import { PrismaService } from '../prisma/prisma.service';
import seed from './demo-enterprise.json';

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
    return [
      {
        id: 'demo-json',
        name: 'Demo JSON Systems',
        type: 'file',
        status: snap ? 'synced' : 'idle',
        lastSyncedAt: snap?.syncedAt.toISOString() ?? null,
        message: snap ? 'Last sync OK' : 'Not synced yet',
      },
    ];
  }

  async syncConnector(organizationId: string, actorUserId: string, connectorId: string) {
    if (connectorId !== 'demo-json') {
      throw new NotFoundException('Unknown connector');
    }
    const connector = createDemoJsonConnector(seed);
    const result = await connector.sync();
    if (!result.ok) {
      throw new NotFoundException(result.message || 'Sync failed');
    }
    const s = result.summary;
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
