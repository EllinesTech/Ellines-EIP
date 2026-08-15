/**
 * Security Anomaly Controller
 *
 * REST endpoints for security anomaly detection management.
 *
 * Routes:
 *   POST   /security/sessions                  — Register a session for monitoring
 *   POST   /security/analyze                   — Full session security analysis
 *   POST   /security/privilege-escalation-check — Check single endpoint access
 *   GET    /security/events                    — List security events for org
 *   PATCH  /security/events/:id/resolve        — Resolve / close an event
 *   POST   /security/protective-action         — Execute a protective action manually
 *   GET    /security/baseline/:userId          — Get user behavior baseline
 *   GET    /security/reports                   — List incident reports for org
 *   GET    /security/reports/:incidentId       — Get a specific incident report
 *
 * Requirements: 15.1–15.8
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AnomalyDetectionEngineService } from './anomaly-detection-engine.service';
import { SecurityIncidentReportGeneratorService } from './security-incident-report-generator.service';
import {
  ProtectiveActionType,
  UserSession,
  SecurityEventType,
} from './security-anomaly.interfaces';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class RegisterSessionDto {
  sessionId!: string;
  userId!: string;
  organizationId!: string;
  ipAddress!: string;
  countryCode!: string;
  startedAt!: string | Date;
  lastActivityAt!: string | Date;
  requestCount!: number;
  dataAccessedBytes!: number;
  exportVolumeBytes!: number;
  endpointsAccessed!: string[];
  isActive!: boolean;
}

export class AnalyzeSessionDto {
  session!: RegisterSessionDto;
  role?: string;
  department?: string;
  autoRemediate?: boolean;
}

export class PrivEscCheckDto {
  userId!: string;
  organizationId!: string;
  sessionId?: string;
  attemptedEndpoint!: string;
  userRole!: string;
}

export class ProtectiveActionDto {
  eventId!: string;
  organizationId!: string;
  action!: ProtectiveActionType;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSession(dto: RegisterSessionDto): UserSession {
  return {
    ...dto,
    startedAt: new Date(dto.startedAt),
    lastActivityAt: new Date(dto.lastActivityAt),
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('security')
export class SecurityAnomalyController {
  constructor(
    private readonly engine: AnomalyDetectionEngineService,
    private readonly reportGen: SecurityIncidentReportGeneratorService,
  ) {}

  // ── Session ─────────────────────────────────────────────────────────────────

  /**
   * Register an active session for monitoring (impossible-travel detection).
   * POST /security/sessions
   */
  @Post('sessions')
  registerSession(@Body() dto: RegisterSessionDto) {
    const session = toSession(dto);
    this.engine.travelDetector.registerSession(session);
    return { registered: true, sessionId: session.sessionId };
  }

  // ── Analysis ─────────────────────────────────────────────────────────────────

  /**
   * Run full security analysis for a session.
   * POST /security/analyze
   */
  @Post('analyze')
  async analyzeSession(@Body() dto: AnalyzeSessionDto) {
    const session = toSession(dto.session);
    const role = dto.role ?? 'staff';
    const department = dto.department ?? 'general';
    const autoRemediate = dto.autoRemediate !== false;

    const result = await this.engine.analyzeSession(session, role, department, autoRemediate);
    return {
      eventsDetected: result.events.length,
      protectiveActionsCount: result.protectiveActionsCount,
      reports: result.reports,
    };
  }

  // ── Privilege Escalation ──────────────────────────────────────────────────────

  /**
   * Check for privilege escalation on a specific endpoint access attempt.
   * POST /security/privilege-escalation-check
   */
  @Post('privilege-escalation-check')
  checkPrivilegeEscalation(@Body() dto: PrivEscCheckDto) {
    const result = this.engine.checkPrivilegeEscalation(
      dto.userId,
      dto.organizationId,
      dto.sessionId,
      dto.attemptedEndpoint,
      dto.userRole,
    );

    return {
      detected: result.detected,
      event: result.event ?? null,
      report: result.report ?? null,
    };
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  /**
   * Get security events for an organization.
   * GET /security/events?orgId=xxx&unresolved=true&limit=20
   */
  @Get('events')
  getEvents(
    @Query('orgId') orgId: string,
    @Query('unresolved') unresolved?: string,
    @Query('limit') limit?: string,
  ) {
    const events = this.engine.getSecurityEvents(orgId, {
      unresolved: unresolved === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { events, total: events.length };
  }

  /**
   * Resolve (close) a security event.
   * PATCH /security/events/:eventId/resolve
   */
  @Patch('events/:eventId/resolve')
  resolveEvent(@Param('eventId') eventId: string) {
    const resolved = this.engine.resolveEvent(eventId);
    return { resolved, eventId };
  }

  // ── Protective Actions ──────────────────────────────────────────────────────

  /**
   * Execute a protective action manually for a detected event.
   * POST /security/protective-action
   */
  @Post('protective-action')
  async executeProtectiveAction(@Body() dto: ProtectiveActionDto) {
    const events = this.engine.getSecurityEvents(dto.organizationId);
    const event = events.find((e) => e.id === dto.eventId);
    if (!event) {
      return { success: false, error: 'Event not found' };
    }
    const result = await this.engine.protection.executeProtectiveAction(event, dto.action);
    return { success: result.success, result };
  }

  // ── Baselines ───────────────────────────────────────────────────────────────

  /**
   * Get behavior baseline for a user.
   * GET /security/baseline/:userId
   */
  @Get('baseline/:userId')
  getBaseline(@Param('userId') userId: string) {
    const baseline = this.engine.profiler.getUserBaseline(userId);
    return baseline ?? { userId, message: 'No baseline established yet' };
  }

  /**
   * List all baselines for an organization.
   * GET /security/baseline/org/:orgId
   */
  @Get('baseline/org/:orgId')
  getOrgBaselines(@Param('orgId') orgId: string) {
    const baselines = this.engine.profiler.listOrganizationBaselines(orgId);
    return { baselines, count: baselines.length };
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  /**
   * List security incident reports for an organization.
   * GET /security/reports?orgId=xxx&eventType=data_exfiltration&limit=20
   */
  @Get('reports')
  listReports(
    @Query('orgId') orgId: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit?: string,
  ) {
    const reports = this.reportGen.listReports(orgId, {
      eventType: eventType as SecurityEventType | undefined,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { reports, total: reports.length };
  }

  /**
   * Get a specific security incident report.
   * GET /security/reports/:incidentId
   */
  @Get('reports/:incidentId')
  getReport(@Param('incidentId') incidentId: string) {
    const report = this.reportGen.getReport(incidentId);
    if (!report) {
      return { error: 'Report not found', incidentId };
    }
    return report;
  }
}
