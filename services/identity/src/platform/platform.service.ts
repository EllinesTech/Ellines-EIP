import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  mergeOrganizationSettings,
  readPlatformOrgStatus,
  type PlatformOrgStatus,
} from '@ellines-eip/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrganizations() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { users: true } },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt.toISOString(),
      userCount: o._count.users,
      status: readPlatformOrgStatus(o.settings),
    }));
  }

  async updateOrganizationStatus(
    orgId: string,
    status: PlatformOrgStatus,
    actorUserId: string,
    actorEmail: string,
  ) {
    if (status !== 'active' && status !== 'suspended') {
      throw new BadRequestException('status must be active or suspended');
    }
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const nextSettings = mergeOrganizationSettings(org.settings, {
      platformStatus: status,
    });
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { settings: nextSettings as Prisma.InputJsonValue },
      include: { _count: { select: { users: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: actorUserId,
        action: status === 'suspended' ? 'platform.org.suspend' : 'platform.org.resume',
        resource: 'organization',
        metadata: { actorEmail, status, slug: org.slug },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      createdAt: updated.createdAt.toISOString(),
      userCount: updated._count.users,
      status: readPlatformOrgStatus(updated.settings),
    };
  }

  /** Placeholder flags until a dedicated config store exists. */
  listFeatureFlags() {
    return [
      {
        key: 'ellinea_chat',
        label: 'Ellinea chat',
        enabled: false,
        note: 'Unlocks Ask Ellinea production chat',
      },
      {
        key: 'live_connectors',
        label: 'Live connectors',
        enabled: false,
        note: 'Integration Hub sync to Command Center',
      },
      {
        key: 'ceo_daily_brief',
        label: 'CEO Daily Brief',
        enabled: false,
        note: 'Automated morning summary delivery',
      },
    ];
  }
}
