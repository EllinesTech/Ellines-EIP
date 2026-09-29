/**
 * SecurityPolicyController — PATCH /api/v1/orgs/:slug/security-policy
 *
 * Allows org admins (owner / admin role) to configure anomaly detection
 * sensitivity, optional auto-remediation actions, and a notification rule
 * reference.  The policy is persisted as a JSON sub-object inside
 * `Organization.settings.securityPolicy`.
 *
 * Requirements: 15.8
 */

import {
  Controller,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

// ─── DTO ──────────────────────────────────────────────────────────────────────

type AnomalySensitivity = 'low' | 'medium' | 'high';
const VALID_SENSITIVITIES: AnomalySensitivity[] = ['low', 'medium', 'high'];

interface UpdateSecurityPolicyDto {
  anomalySensitivity: AnomalySensitivity;
  autoRemediationActions?: string[];
  notificationRuleId?: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('orgs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SecurityPolicyController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * PATCH /api/v1/orgs/:slug/security-policy
   *
   * Admin-only.  Validates the sensitivity value and deep-merges the supplied
   * policy fields into `Organization.settings.securityPolicy`.
   *
   * The caller must belong to the org identified by `:slug` — cross-tenant
   * access is rejected with 403.
   */
  @Patch(':slug/security-policy')
  @Roles('owner', 'admin')
  async updateSecurityPolicy(
    @Param('slug') slug: string,
    @Body() body: UpdateSecurityPolicyDto,
    @Request() req: { user: { organizationId: string; role: string } },
  ) {
    // ── Validate sensitivity ──────────────────────────────────────────────────
    if (!body.anomalySensitivity || !VALID_SENSITIVITIES.includes(body.anomalySensitivity)) {
      throw new BadRequestException(
        `anomalySensitivity must be one of: ${VALID_SENSITIVITIES.join(', ')}`,
      );
    }

    // ── Resolve org ───────────────────────────────────────────────────────────
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, settings: true },
    });

    if (!org) {
      throw new NotFoundException(`Organization "${slug}" not found`);
    }

    // ── Tenant isolation — caller must belong to this org ────────────────────
    if (org.id !== req.user.organizationId) {
      throw new ForbiddenException(
        'You do not have permission to modify this organisation\'s security policy',
      );
    }

    // ── Merge policy into existing settings JSON ──────────────────────────────
    const currentSettings =
      typeof org.settings === 'object' && org.settings !== null
        ? (org.settings as Record<string, unknown>)
        : {};

    const updatedPolicy: Record<string, unknown> = {
      anomalySensitivity: body.anomalySensitivity,
    };
    if (Array.isArray(body.autoRemediationActions)) {
      updatedPolicy['autoRemediationActions'] = body.autoRemediationActions;
    }
    if (body.notificationRuleId !== undefined) {
      updatedPolicy['notificationRuleId'] = body.notificationRuleId;
    }

    const updatedSettings: Record<string, unknown> = {
      ...currentSettings,
      securityPolicy: updatedPolicy,
    };

    const updated = await this.prisma.organization.update({
      where: { id: org.id },
      data: { settings: updatedSettings as Prisma.InputJsonValue },
      select: { id: true, slug: true, settings: true },
    });

    const policy = (updated.settings as Record<string, unknown>)['securityPolicy'];

    return {
      organizationId: updated.id,
      slug: updated.slug,
      securityPolicy: policy,
    };
  }
}
