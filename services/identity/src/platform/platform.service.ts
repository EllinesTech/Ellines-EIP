import { Injectable } from '@nestjs/common';
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
      status: 'active' as const,
    }));
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
