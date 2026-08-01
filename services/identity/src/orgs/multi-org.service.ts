import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MultiOrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * List all organizations a user is a member of.
   * Returns the primary org (from User.organizationId) plus any memberships.
   */
  async listMyOrgs(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // All explicit memberships
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, isActive: true },
      include: { organization: true },
    });

    // Build a de-duplicated set. Primary org always first.
    const seen = new Set<string>();
    const orgs: {
      id: string; name: string; slug: string;
      role: string; isPrimary: boolean; parentOrgId: string | null;
    }[] = [];

    // Primary org
    seen.add(user.organization.id);
    orgs.push({
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      role: user.role,
      isPrimary: true,
      parentOrgId: user.organization.parentOrgId ?? null,
    });

    // Additional memberships
    for (const m of memberships) {
      if (!seen.has(m.organization.id)) {
        seen.add(m.organization.id);
        orgs.push({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          role: m.role,
          isPrimary: false,
          parentOrgId: m.organization.parentOrgId ?? null,
        });
      }
    }

    return orgs;
  }

  /**
   * Switch to a different organization.
   * Issues a new JWT scoped to the target org.
   */
  async switchOrg(userId: string, targetOrgId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Check primary org first
    let role: string | null = null;
    if (user.organizationId === targetOrgId) {
      role = user.role;
    } else {
      // Check memberships
      const membership = await this.prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId, organizationId: targetOrgId } },
      });
      if (!membership || !membership.isActive) {
        throw new ForbiddenException('You are not a member of that organization');
      }
      role = membership.role;
    }

    const org = await this.prisma.organization.findUnique({ where: { id: targetOrgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const accessToken = this.jwt.sign({
      sub: userId,
      email: user.email,
      organizationId: targetOrgId,
      role,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: targetOrgId,
        userId,
        action: 'auth.switch_org',
        resource: 'organization',
        metadata: { fromOrgId: user.organizationId, toOrgId: targetOrgId },
      },
    });

    return {
      accessToken,
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '24h',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        title: user.title ?? null,
        bio: user.bio ?? null,
        avatarUrl: user.avatarUrl ?? null,
        organizationId: targetOrgId,
        role,
        isActive: user.isActive,
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    };
  }

  /**
   * Owner creates a new child organization linked to the current one.
   * The owner automatically gets a membership row in the child org as owner.
   */
  async createChildOrg(
    userId: string,
    actorRole: string,
    parentOrgId: string,
    name: string,
  ) {
    if (actorRole !== 'owner') {
      throw new ForbiddenException('Only the Organization Owner can create linked organizations');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const slug = this.slugify(name);
    const existingSlug = await this.prisma.organization.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ConflictException('Organization name already taken — try a different name');
    }

    const childOrg = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name, slug, parentOrgId },
      });

      // Add membership row so the owner can switch into this org
      await tx.organizationMembership.create({
        data: { userId, organizationId: org.id, role: 'owner' },
      });

      await tx.auditLog.create({
        data: {
          organizationId: parentOrgId,
          userId,
          action: 'org.create_child',
          resource: 'organization',
          metadata: { childOrgId: org.id, childOrgName: org.name },
        },
      });

      return org;
    });

    return {
      id: childOrg.id,
      name: childOrg.name,
      slug: childOrg.slug,
      parentOrgId: childOrg.parentOrgId,
      createdAt: childOrg.createdAt.toISOString(),
    };
  }

  private slugify(name: string): string {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw new ForbiddenException('Organization name is invalid');
    return slug;
  }
}
