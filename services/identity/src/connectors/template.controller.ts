import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TemplateService } from './template.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Helper: resolve the PLATFORM_ADMIN_EMAILS allowlist from the NestJS module
 * config.  Reads from process.env so it matches the same source as
 * `platformAdminFromEnv()` used in the Pages Functions layer.
 */
function isPlatformAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const raw = process.env['PLATFORM_ADMIN_EMAILS'] ?? '';
  const allowed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

interface AuthReq {
  user?: { email?: string; sub?: string };
}

@Controller('connectors/templates')
export class TemplateController {
  constructor(
    private templateService: TemplateService,
    private prisma: PrismaService,
  ) {}

  /**
   * GET /api/v1/connectors/templates
   * List all templates (optionally filter by category)
   * Public (authenticated) — any org user may browse the template catalogue.
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async listTemplates(@Query('category') category?: string) {
    return this.templateService.listTemplates(category);
  }

  /**
   * GET /api/v1/connectors/templates/:id
   * Get a single template by ID
   * Public (authenticated).
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getTemplate(@Param('id') id: string) {
    return this.templateService.getById(id);
  }

  /**
   * GET /api/v1/connectors/templates/:id/schema
   * Get the configuration schema for a template
   * Public (authenticated).
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id/schema')
  async getTemplateSchema(@Param('id') id: string) {
    return this.templateService.getConfigSchema(id);
  }

  /**
   * POST /api/v1/connectors/install-from-template
   *
   * PLATFORM ADMIN ONLY (Connector Governance Rule §5).
   *
   * Client organization users must never be able to install connectors.
   * This endpoint enforces three server-side gates:
   *   Gate 1  — caller must be a platform admin (checked against PLATFORM_ADMIN_EMAILS).
   *   Gate 2  — targetOrgId is required and must exist.
   *   Gate 3  — max_connectors entitlement is checked before insert.
   *
   * The Pages Function proxy (`/api/v1/connectors/install-from-template`)
   * forwards the request here; this controller is the authoritative enforcement
   * point for the identity-service path.
   */
  @UseGuards(JwtAuthGuard)
  @Post('install-from-template')
  async installFromTemplate(
    @Request() req: AuthReq,
    @Body()
    input: {
      organizationId: string;
      templateId: string;
      templateConfig: Record<string, any>;
      displayName?: string;
    },
  ) {
    // Gate 1: platform admin only
    if (!isPlatformAdmin(req.user?.email)) {
      throw new ForbiddenException(
        'Connector installation is a platform admin operation. ' +
          'Client organizations cannot install connectors directly.',
      );
    }

    // Gate 2: targetOrgId is required and must resolve to a real organisation
    const targetOrgId = (input.organizationId ?? '').trim();
    if (!targetOrgId) {
      throw new BadRequestException(
        'organizationId is required. Specify the client organization to install the connector for.',
      );
    }
    const targetOrg = await this.prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: {
        id: true,
        name: true,
        organizationTier: {
          select: {
            tier: { select: { maxConnectors: true } },
            customLimits: true,
          },
        },
      },
    });
    if (!targetOrg) {
      throw new BadRequestException(`Target organization not found: ${targetOrgId}`);
    }

    // Gate 3: enforce max_connectors entitlement server-side.
    // Resolve limit: custom_limits override tier default (mirrors getOrgEntitlement logic).
    const tierLimit = targetOrg.organizationTier?.tier?.maxConnectors ?? null;
    const customLimits = targetOrg.organizationTier?.customLimits as Record<string, unknown> | null;
    const customLimit =
      typeof customLimits?.['max_connectors'] === 'number'
        ? (customLimits['max_connectors'] as number)
        : null;
    const maxConnectors = customLimit ?? tierLimit;

    if (maxConnectors !== null) {
      const current = await this.prisma.connectorInstallation.count({
        where: { organizationId: targetOrgId, status: { not: 'deleted' } },
      });
      if (current >= maxConnectors) {
        throw new UnprocessableEntityException(
          `Connector limit reached. This organization's package allows ${maxConnectors} connector(s) and ${current} are already installed.`,
        );
      }
    }

    return this.templateService.installFromTemplate(
      targetOrgId,
      input.templateId,
      input.templateConfig ?? {},
      input.displayName ?? '',
    );
  }

  /**
   * POST /api/v1/connectors/test-template
   * Test a template connection — platform admin only.
   * Prevents client-org users from probing arbitrary endpoints.
   */
  @UseGuards(JwtAuthGuard)
  @Post('test-template')
  async testTemplate(
    @Request() req: AuthReq,
    @Body()
    input: {
      templateId: string;
      config: Record<string, any>;
    },
  ) {
    if (!isPlatformAdmin(req.user?.email)) {
      throw new ForbiddenException('Template connection tests are a platform admin operation.');
    }
    return this.templateService.testTemplate(input.templateId, input.config);
  }

  /**
   * POST /api/v1/connectors/templates (Admin)
   * Create a new template — platform admin only.
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  async createTemplate(@Request() req: AuthReq, @Body() input: any) {
    if (!isPlatformAdmin(req.user?.email)) {
      throw new ForbiddenException('Template management is a platform admin operation.');
    }
    return this.templateService.create(input);
  }

  /**
   * PATCH /api/v1/connectors/templates/:id (Admin)
   * Update a template — platform admin only.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateTemplate(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() input: any,
  ) {
    if (!isPlatformAdmin(req.user?.email)) {
      throw new ForbiddenException('Template management is a platform admin operation.');
    }
    return this.templateService.update(id, input);
  }

  /**
   * DELETE /api/v1/connectors/templates/:id (Admin)
   * Delete a template — platform admin only.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteTemplate(@Request() req: AuthReq, @Param('id') id: string) {
    if (!isPlatformAdmin(req.user?.email)) {
      throw new ForbiddenException('Template management is a platform admin operation.');
    }
    await this.templateService.delete(id);
    return { ok: true };
  }
}
