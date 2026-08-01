import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ORG_ADMIN_ROLES } from '@ellines-eip/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WorkflowService } from './workflow.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { CreateRuleDto } from './dto/create-rule.dto';
import { CreateReportDto } from './dto/create-report.dto';

type AuthReq = {
  user: {
    userId: string;
    organizationId: string;
    role: string;
    fullName?: string;
    email: string;
  };
};

@Controller('orgs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  // ── Approvals ─────────────────────────────────────────────────────────────

  /** GET /api/v1/orgs/me/approvals — any authenticated user */
  @Get('me/approvals')
  listApprovals(@Request() req: AuthReq) {
    return this.workflow.listApprovals(req.user.organizationId);
  }

  /** POST /api/v1/orgs/me/approvals — any authenticated user can submit */
  @Post('me/approvals')
  createApproval(@Request() req: AuthReq, @Body() dto: CreateApprovalDto) {
    const actorName = req.user.fullName || req.user.email;
    return this.workflow.createApproval(
      req.user.organizationId,
      req.user.userId,
      actorName,
      dto,
    );
  }

  /** POST /api/v1/orgs/me/approvals/:id/decide — approve or reject a step */
  @Post('me/approvals/:id/decide')
  decideApproval(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.workflow.decideApproval(
      req.user.organizationId,
      id,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  // ── Business Rules ────────────────────────────────────────────────────────

  /** GET /api/v1/orgs/me/rules — Owner/IT only */
  @Get('me/rules')
  @Roles(...ORG_ADMIN_ROLES)
  listRules(@Request() req: AuthReq) {
    return this.workflow.listRules(req.user.organizationId);
  }

  /** POST /api/v1/orgs/me/rules */
  @Post('me/rules')
  @Roles(...ORG_ADMIN_ROLES)
  createRule(@Request() req: AuthReq, @Body() dto: CreateRuleDto) {
    return this.workflow.createRule(req.user.organizationId, req.user.userId, dto);
  }

  /** PATCH /api/v1/orgs/me/rules/:id */
  @Patch('me/rules/:id')
  @Roles(...ORG_ADMIN_ROLES)
  toggleRule(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.workflow.toggleRule(
      req.user.organizationId,
      id,
      req.user.userId,
      Boolean(body.enabled),
    );
  }

  /** DELETE /api/v1/orgs/me/rules/:id */
  @Delete('me/rules/:id')
  @Roles(...ORG_ADMIN_ROLES)
  deleteRule(@Request() req: AuthReq, @Param('id') id: string) {
    return this.workflow.deleteRule(req.user.organizationId, id, req.user.userId);
  }

  // ── Scheduled Reports ─────────────────────────────────────────────────────

  /** GET /api/v1/orgs/me/reports */
  @Get('me/reports')
  @Roles(...ORG_ADMIN_ROLES)
  listReports(@Request() req: AuthReq) {
    return this.workflow.listReports(req.user.organizationId);
  }

  /** POST /api/v1/orgs/me/reports */
  @Post('me/reports')
  @Roles(...ORG_ADMIN_ROLES)
  createReport(@Request() req: AuthReq, @Body() dto: CreateReportDto) {
    return this.workflow.createReport(req.user.organizationId, req.user.userId, dto);
  }

  /** POST /api/v1/orgs/me/reports/:id/run */
  @Post('me/reports/:id/run')
  @Roles(...ORG_ADMIN_ROLES)
  runReport(@Request() req: AuthReq, @Param('id') id: string) {
    return this.workflow.runReport(req.user.organizationId, id, req.user.userId);
  }

  /** PATCH /api/v1/orgs/me/reports/:id */
  @Patch('me/reports/:id')
  @Roles(...ORG_ADMIN_ROLES)
  toggleReport(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.workflow.toggleReport(
      req.user.organizationId,
      id,
      req.user.userId,
      Boolean(body.enabled),
    );
  }

  /** DELETE /api/v1/orgs/me/reports/:id */
  @Delete('me/reports/:id')
  @Roles(...ORG_ADMIN_ROLES)
  deleteReport(@Request() req: AuthReq, @Param('id') id: string) {
    return this.workflow.deleteReport(req.user.organizationId, id, req.user.userId);
  }

  // ── Event Bus ─────────────────────────────────────────────────────────────

  /** GET /api/v1/orgs/me/events?limit=100 */
  @Get('me/events')
  listEvents(@Request() req: AuthReq, @Query('limit') limit?: string) {
    return this.workflow.listEvents(req.user.organizationId, limit ? Number(limit) : 100);
  }

  /** POST /api/v1/orgs/me/events — publish event to server bus */
  @Post('me/events')
  publishEvent(
    @Request() req: AuthReq,
    @Body() body: { type: string; payload?: Record<string, unknown> },
  ) {
    const type =
      typeof body.type === 'string' ? body.type.trim().slice(0, 80) : 'unknown';
    return this.workflow.publishEvent(req.user.organizationId, type, body.payload || {});
  }
}
