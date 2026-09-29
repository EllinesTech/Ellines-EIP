/**
 * FederatedLearningController
 *
 * NestJS controller for federated learning management.
 * All routes require JWT authentication (JwtAuthGuard at class level).
 *
 * Routes:
 *   GET  /api/v1/federated-learning/rounds            — list rounds (platform admin only)
 *   POST /api/v1/federated-learning/rounds            — start new round (platform admin only)
 *   GET  /api/v1/federated-learning/rounds/:id/report — transparency report (platform admin only)
 *   PATCH /api/v1/federated-learning/orgs/:orgId/settings — org opt-in/out (owner only)
 *
 * The "platform admin" guard for this controller checks `req.user.isPlatformAdmin`.
 * That flag is set by the JWT strategy when the token email matches PLATFORM_ADMIN_EMAILS.
 *
 * Requirements: 3.1–3.8
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  isPlatformAdminEmail,
  parsePlatformAdminEmails,
} from '@ellines-eip/shared';
import {
  FederatedLearningService,
  TransparencyReport,
} from './federated-learning.service';
import { PrismaService } from '../prisma/prisma.service';

type AuthReq = {
  user: {
    userId: string;
    organizationId: string;
    role: string;
    email: string;
  };
};

// ─── DTOs ──────────────────────────────────────────────────────────────────────

interface StartRoundDto {
  name: string;
  privacyBudget: number;
  minParticipants?: number;
}

interface OrgFederatedSettingDto {
  optInFederated: boolean;
}

// ─── Controller ────────────────────────────────────────────────────────────────

@Controller('federated-learning')
@UseGuards(JwtAuthGuard)
export class FederatedLearningController {
  private readonly logger = new Logger(FederatedLearningController.name);

  constructor(
    private readonly federatedService: FederatedLearningService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Platform admin routes ───────────────────────────────────────────────────

  /**
   * GET /api/v1/federated-learning/rounds
   *
   * List all training rounds. Platform Super Admin only.
   * Requirements: 3.1, 3.8
   */
  @Get('rounds')
  async listRounds(@Request() req: AuthReq) {
    this.assertPlatformAdmin(req.user.email);

    const rounds = await this.prisma.federatedLearningRound.findMany({
      orderBy: { roundNumber: 'desc' },
      include: { _count: { select: { participants: true } } },
    });

    return rounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      modelType: r.modelType,
      status: r.status,
      participantCount: r.participantCount,
      privacyBudget: r.privacyBudget,
      aggregationStrategy: r.aggregationStrategy,
      globalModelVersion: r.globalModelVersion,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
    }));
  }

  /**
   * POST /api/v1/federated-learning/rounds
   *
   * Start a new federated training round. Platform Super Admin only.
   * Requirements: 3.1, 3.4
   */
  @Post('rounds')
  @HttpCode(HttpStatus.CREATED)
  async startRound(@Body() dto: StartRoundDto, @Request() req: AuthReq) {
    this.assertPlatformAdmin(req.user.email);

    if (!dto.name || typeof dto.name !== 'string') {
      throw new ForbiddenException('name is required');
    }
    if (typeof dto.privacyBudget !== 'number' || dto.privacyBudget <= 0) {
      throw new ForbiddenException('privacyBudget must be a positive number');
    }

    this.logger.log(
      `[startRound] Platform admin ${req.user.email} starting round name="${dto.name}"`,
    );

    const round = await this.federatedService.startTrainingRound({
      name: dto.name,
      privacyBudget: dto.privacyBudget,
      minParticipants: dto.minParticipants,
    });

    return round;
  }

  /**
   * GET /api/v1/federated-learning/rounds/:id/report
   *
   * Transparency report for a round. Platform Super Admin only.
   * Requirements: 3.7, 3.8
   */
  @Get('rounds/:id/report')
  async getReport(
    @Param('id') id: string,
    @Request() req: AuthReq,
  ): Promise<TransparencyReport> {
    this.assertPlatformAdmin(req.user.email);
    return this.federatedService.generateReport(id);
  }

  // ── Org settings route ──────────────────────────────────────────────────────

  /**
   * PATCH /api/v1/federated-learning/orgs/:orgId/settings
   *
   * Allow an org Owner to opt-in or opt-out of federated learning.
   * On opt-out: immediately removes the org from any open round.
   *
   * Requirements: 3.4, 3.8
   */
  @Patch('orgs/:orgId/settings')
  async updateFederatedSetting(
    @Param('orgId') orgId: string,
    @Body() dto: OrgFederatedSettingDto,
    @Request() req: AuthReq,
  ) {
    // Gate: must be org owner AND the org must be the caller's org
    if (req.user.organizationId !== orgId) {
      throw new ForbiddenException(
        'You can only update federated settings for your own organisation',
      );
    }
    if (req.user.role !== 'owner') {
      throw new ForbiddenException('Only an organisation owner can change federated learning settings');
    }
    if (typeof dto.optInFederated !== 'boolean') {
      throw new ForbiddenException('optInFederated must be a boolean');
    }

    // Load current settings
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    if (!org) {
      throw new NotFoundException(`Organisation ${orgId} not found`);
    }

    const currentSettings = (org.settings as Record<string, unknown>) ?? {};
    const updatedSettings = { ...currentSettings, optInFederated: dto.optInFederated };

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { settings: updatedSettings },
    });

    // Safeguard (Req 3.8): on opt-out, remove from any currently open round
    if (!dto.optInFederated) {
      await this.removeFromOpenRounds(orgId);
    }

    this.logger.log(
      `[updateFederatedSetting] orgId=${orgId} optInFederated=${dto.optInFederated}`,
    );

    return { orgId, optInFederated: dto.optInFederated };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Remove the org from all currently open federated learning rounds.
   * Called immediately on opt-out (Requirement 3.8).
   */
  private async removeFromOpenRounds(orgId: string): Promise<void> {
    const openRounds = await this.prisma.federatedLearningRound.findMany({
      where: { status: 'in_progress' },
      select: { id: true },
    });

    if (openRounds.length === 0) return;

    const roundIds = openRounds.map((r) => r.id);

    // Delete participant rows so the org is fully removed from open rounds
    const { count } = await this.prisma.federatedLearningParticipant.deleteMany({
      where: {
        roundId: { in: roundIds },
        organizationId: orgId,
      },
    });

    if (count > 0) {
      this.logger.log(
        `[removeFromOpenRounds] Removed orgId=${orgId} from ${count} open round(s) after opt-out`,
      );

      // Update participant counts on affected rounds
      for (const round of openRounds) {
        const remaining = await this.prisma.federatedLearningParticipant.count({
          where: { roundId: round.id },
        });
        await this.prisma.federatedLearningRound.update({
          where: { id: round.id },
          data: { participantCount: remaining },
        });
      }
    }
  }

  /**
   * Throw ForbiddenException if the caller is not a platform admin.
   * Uses PLATFORM_ADMIN_EMAILS env var, same as PlatformController.
   */
  private assertPlatformAdmin(email: string): void {
    const allowlist = parsePlatformAdminEmails(
      this.config.get<string>('PLATFORM_ADMIN_EMAILS'),
    );
    if (!isPlatformAdminEmail(email, allowlist)) {
      throw new ForbiddenException('Platform Super Admin access required');
    }
  }
}
