/**
 * Self-Healing Learner Controller
 *
 * REST endpoints for the Learner service:
 *   POST /learner/outcomes          — record a remediation outcome          (Req 6.1)
 *   GET  /learner/patterns          — analyse and retrieve success patterns  (Req 6.2)
 *   POST /learner/manual-fix        — submit an admin manual fix             (Req 6.3)
 *   GET  /learner/recommendations   — get architecture recommendations       (Req 6.6)
 *   GET  /learner/recurring-issues  — list recurring issues                  (Req 6.5)
 *   POST /learner/approve/:id       — approve a pending strategy             (Req 6.8)
 *   POST /learner/reject/:id        — reject a pending strategy              (Req 6.8)
 *   GET  /learner/pending-approvals — list strategies awaiting approval      (Req 6.8)
 *   GET  /learner/federated         — get federated learning contribution    (Req 6.7)
 *   POST /learner/adjust-threshold  — trigger EMA threshold adjustment       (Req 6.4)
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { LearnerService } from './learner.service';
import { ManualFix, TimeRange } from './learner.interfaces';
import { Incident, RemediationResult } from '../remediation/remediation.service';

// ── Request body DTOs ────────────────────────────────────────────────────────

class RecordOutcomeDto {
  result: RemediationResult;
  incident: Incident;
}

class AnalyseSuccessesDto {
  from: string; // ISO date string
  to: string;
}

class LearnManualFixDto {
  incident: Incident;
  fix: ManualFix;
}

class AdjustThresholdDto {
  errorPattern: string;
}

class ApproveStrategyDto {
  reviewerId: string;
  notes?: string;
}

class RejectStrategyDto {
  reviewerId: string;
  notes?: string;
}

// ── Controller ───────────────────────────────────────────────────────────────

@Controller('learner')
export class LearnerController {
  private readonly logger = new Logger(LearnerController.name);

  constructor(private readonly learnerService: LearnerService) {}

  /**
   * POST /learner/outcomes
   * Record outcome of a remediation attempt.
   * Req 6.1
   */
  @Post('outcomes')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordOutcome(@Body() dto: RecordOutcomeDto): Promise<void> {
    this.logger.log(`POST /learner/outcomes — incident: ${dto.incident?.id}`);
    await this.learnerService.recordOutcome(dto.result, dto.incident);
  }

  /**
   * GET /learner/patterns?from=<ISO>&to=<ISO>
   * Analyse successes within a time window and return patterns.
   * Req 6.2
   */
  @Get('patterns')
  async getPatterns(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const timeWindow: TimeRange = {
      from: from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      to: to ? new Date(to) : new Date(),
    };
    this.logger.log(
      `GET /learner/patterns — window: ${timeWindow.from.toISOString()} → ${timeWindow.to.toISOString()}`,
    );
    return this.learnerService.analyzeSuccesses(timeWindow);
  }

  /**
   * POST /learner/manual-fix
   * Learn from a manual admin fix.
   * Req 6.3
   */
  @Post('manual-fix')
  async learnFromManualFix(@Body() dto: LearnManualFixDto) {
    this.logger.log(
      `POST /learner/manual-fix — incident: ${dto.incident?.id}, admin: ${dto.fix?.adminId}`,
    );
    return this.learnerService.learnFromManualFix(dto.incident, dto.fix);
  }

  /**
   * GET /learner/recommendations
   * Get architecture improvement recommendations.
   * Req 6.6
   */
  @Get('recommendations')
  async getRecommendations() {
    this.logger.log('GET /learner/recommendations');
    return this.learnerService.recommendImprovements();
  }

  /**
   * GET /learner/recurring-issues?organizationId=<id>
   * List recurring issues flagged for permanent fix.
   * Req 6.5
   */
  @Get('recurring-issues')
  async getRecurringIssues(@Query('organizationId') organizationId?: string) {
    this.logger.log(`GET /learner/recurring-issues — org: ${organizationId ?? 'all'}`);
    return this.learnerService.getRecurringIssues(organizationId);
  }

  /**
   * GET /learner/pending-approvals
   * List strategy candidates awaiting Platform_Super_Admin approval.
   * Req 6.8
   */
  @Get('pending-approvals')
  async getPendingApprovals() {
    this.logger.log('GET /learner/pending-approvals');
    return this.learnerService.getPendingApprovals();
  }

  /**
   * POST /learner/approve/:id
   * Approve a pending strategy and deploy it to the playbook.
   * Req 6.8
   */
  @Post('approve/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveStrategy(
    @Param('id') candidateId: string,
    @Body() dto: ApproveStrategyDto,
  ): Promise<void> {
    this.logger.log(`POST /learner/approve/${candidateId} — reviewer: ${dto.reviewerId}`);
    await this.learnerService.approveStrategy(candidateId, dto.reviewerId, dto.notes);
  }

  /**
   * POST /learner/reject/:id
   * Reject a pending strategy candidate.
   * Req 6.8
   */
  @Post('reject/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectStrategy(
    @Param('id') candidateId: string,
    @Body() dto: RejectStrategyDto,
  ): Promise<void> {
    this.logger.log(`POST /learner/reject/${candidateId} — reviewer: ${dto.reviewerId}`);
    await this.learnerService.rejectStrategy(candidateId, dto.reviewerId, dto.notes);
  }

  /**
   * GET /learner/federated?organizationId=<id>
   * Prepare and return a federated learning contribution.
   * Req 6.7
   */
  @Get('federated')
  async getFederatedContribution(@Query('organizationId') organizationId?: string) {
    this.logger.log(`GET /learner/federated — org: ${organizationId ?? 'platform'}`);
    return this.learnerService.shareStrategies(organizationId);
  }

  /**
   * POST /learner/adjust-threshold
   * Trigger EMA-based confidence threshold adjustment for a pattern.
   * Req 6.4
   */
  @Post('adjust-threshold')
  async adjustThreshold(@Body() dto: AdjustThresholdDto) {
    this.logger.log(`POST /learner/adjust-threshold — pattern: ${dto.errorPattern}`);
    return this.learnerService.adjustThresholds(dto.errorPattern);
  }
}
