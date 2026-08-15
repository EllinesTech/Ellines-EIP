/**
 * Security Anomaly Controller
 *
 * REST endpoints for security anomaly detection management.
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
import { SecurityAnomalyDetectorService } from './security-anomaly-detector.service';
import {
  UserSession,
  SecurityPolicy,
  SecurityEventType,
  ProtectiveActionType,
} from './security-anomaly.interfaces';

// ── Request DTOs ─────────────────────────────────────────────────────────────

export class RegisterSessionDto implements UserSession {
  sessionId!: string;
  userId!: string;
  organizationId!: string;
  ipAddress!: string;
  countryCode!: string;
  startedAt!: Date;
  lastActivityAt!: Date;
  requestCount!: number;
  dataAccessedBytes!: number;
  exportVolumeBytes!: number;
  endpointsAccessed!: string[];
  isActive!: boolean;
}

export class AnalyzeSessionDto {
  session!: UserSession;
  autoRemediate?: boolean;
}

export class PrivEscCheckDto {
  userId!: string;
  organizationId!: string;
  sessionId!: string;
  attemptedEndpoint!: string;
  userRole!: string;
}

export class UpdatePolicyDto {
  anomalySensitivity?: number;
  exfiltrationThresholdMultiplier?: number;
  impossibleTravelWindowHours?: number;
  autoRemediationEnabled?: Record<SecurityEventType, boolean>;
  notifyChannels?: Array<'email' | 'in_app' | 'webhook'>;
  webhookUrl?: string;
}

export class ProtectiveActionDto {
  eventId!: string;
  organizationId!: string;
  action!: ProtectiveActionType;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('security')
export class SecurityAnomalyController {
  constructor(private readonly detector: SecurityAnomalyDetectorService) {}

  /**
   * Register an active session for monitoring.
   * POST /security/sessions
   */
  @Post('sessions')
  registerSession(@Body() dto: RegisterSessionDto) {
    const session: UserSession = {
      ...dto,
      startedAt: new Date(dto.startedAt),
      lastActivityAt: new Date(dto.lastActivityAt),
    };
    this.detector.registerSession(session);
    return { registered: true, sessionId: session.sessionId };
  }

  /**
   * Analyze a session for security anomalies and optionally auto-remediate.
   * POST /security/analyze
   */
  @Post('analyze')
  async analyzeSession(@Body() dto: AnalyzeSessionDto) {
    const session: UserSession = {
      ...dto.session,
      startedAt: new Date(dto.session.startedAt),
      lastActivityAt: new Date(dto.session.lastActivityAt),
    };
    this.detector.registerSession(session);

    const events = await this.detector.analyzeSession(session);

    const reports = [];
    for (const event of events) {
      let actionsTaken = [];
      if (dto.autoRemediate !== false) {
        actionsTaken = await this.detector.autoRemediate(event);
      }
      const report = this.detector.generateIncidentReport(event, actionsTaken);
      reports.push(report);
    }

    return { eventsDetected: events.length, reports };
  }

  /**
   * Check for privilege escalation on a specific endpoint access attempt.
   * POST /security/privilege-escalation-check
   */
  @Post('privilege-escalation-check')
  checkPrivilegeEscalation(@Body() dto: PrivEscCheckDto) {
    const event = this.detector.detectPrivilegeEscalation(
      dto.userId,
      dto.organizationId,
      dto.sessionId,
      dto.attemptedEndpoint,
      dto.userRole,
    );

    if (!event) {
      return { detected: false };
    }

    const report = this.detector.generateIncidentReport(event, []);
    return { detected: true, event, report };
  }

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
    const events = this.detector.getSecurityEvents(orgId, {
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
    const resolved = this.detector.resolveEvent(eventId);
    return { resolved, eventId };
  }

  /**
   * Execute a protective action for an event.
   * POST /security/protective-action
   */
  @Post('protective-action')
  async executeProtectiveAction(@Body() dto: ProtectiveActionDto) {
    const events = this.detector.getSecurityEvents(dto.organizationId);
    const event = events.find((e) => e.id === dto.eventId);
    if (!event) {
      return { success: false, error: 'Event not found' };
    }
    const result = await this.detector.executeProtectiveAction(event, dto.action);
    return { success: result.success, result };
  }

  /**
   * Get behavior baseline for a user.
   * GET /security/baseline/:userId
   */
  @Get('baseline/:userId')
  getBaseline(@Param('userId') userId: string) {
    const baseline = this.detector.getBaseline(userId);
    return baseline ?? { userId, message: 'No baseline established yet' };
  }

  /**
   * Get security policy for an organization.
   * GET /security/policy/:orgId
   */
  @Get('policy/:orgId')
  getPolicy(@Param('orgId') orgId: string) {
    return this.detector.getEffectivePolicy(orgId);
  }

  /**
   * Update security policy for an organization.
   * PATCH /security/policy/:orgId
   */
  @Patch('policy/:orgId')
  updatePolicy(@Param('orgId') orgId: string, @Body() dto: UpdatePolicyDto) {
    return this.detector.setPolicy(orgId, dto);
  }
}
