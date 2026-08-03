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
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { ExecuteAgentDto, ApproveExecutionDto } from './dto/execute-agent.dto';
import { CreateWebhookSubscriptionDto, UpdateWebhookSubscriptionDto } from './dto/webhook-subscription.dto';
import { ProvideFeedbackDto } from './dto/feedback.dto';

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
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  // ── Agents CRUD ───────────────────────────────────────────────────────────

  /** GET /api/v1/orgs/me/agents — Owner/IT only */
  @Get('me/agents')
  @Roles(...ORG_ADMIN_ROLES)
  listAgents(@Request() req: AuthReq) {
    return this.agents.listAgents(req.user.organizationId);
  }

  /** GET /api/v1/orgs/me/agents/:id — Owner/IT only */
  @Get('me/agents/:id')
  @Roles(...ORG_ADMIN_ROLES)
  getAgent(@Request() req: AuthReq, @Param('id') id: string) {
    return this.agents.getAgent(req.user.organizationId, id);
  }

  /** POST /api/v1/orgs/me/agents — Owner/IT only */
  @Post('me/agents')
  @Roles(...ORG_ADMIN_ROLES)
  createAgent(@Request() req: AuthReq, @Body() dto: CreateAgentDto) {
    return this.agents.createAgent(
      req.user.organizationId,
      req.user.userId,
      req.user.email,
      dto,
    );
  }

  /** PATCH /api/v1/orgs/me/agents/:id — Owner/IT only */
  @Patch('me/agents/:id')
  @Roles(...ORG_ADMIN_ROLES)
  updateAgent(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agents.updateAgent(
      req.user.organizationId,
      id,
      req.user.userId,
      dto,
    );
  }

  /** DELETE /api/v1/orgs/me/agents/:id — Owner/IT only */
  @Delete('me/agents/:id')
  @Roles(...ORG_ADMIN_ROLES)
  deleteAgent(@Request() req: AuthReq, @Param('id') id: string) {
    return this.agents.deleteAgent(
      req.user.organizationId,
      id,
      req.user.userId,
    );
  }

  // ── Agent Execution ───────────────────────────────────────────────────────

  /** POST /api/v1/orgs/me/agents/:id/execute — Owner/IT only */
  @Post('me/agents/:id/execute')
  @Roles(...ORG_ADMIN_ROLES)
  executeAgent(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: ExecuteAgentDto,
  ) {
    return this.agents.executeAgent(
      req.user.organizationId,
      id,
      req.user.userId,
      dto,
    );
  }

  /** GET /api/v1/orgs/me/agents/executions?agentId=...&limit=50 — Owner/IT only */
  @Get('me/agents-executions')
  @Roles(...ORG_ADMIN_ROLES)
  listExecutions(
    @Request() req: AuthReq,
    @Query('agentId') agentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.agents.listExecutions(
      req.user.organizationId,
      agentId,
      limit ? Number(limit) : 50,
    );
  }

  /** POST /api/v1/orgs/me/agents/executions/:id/approve — Owner/IT only */
  @Post('me/agents-executions/:id/approve')
  @Roles(...ORG_ADMIN_ROLES)
  approveExecution(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: ApproveExecutionDto,
  ) {
    return this.agents.approveExecution(
      req.user.organizationId,
      id,
      req.user.userId,
      req.user.email,
      dto,
    );
  }

  // ── Agent Templates ───────────────────────────────────────────────────────

  /** GET /api/v1/orgs/me/agent-templates — Owner/IT only */
  @Get('me/agent-templates')
  @Roles(...ORG_ADMIN_ROLES)
  listAgentTemplates() {
    return this.agents.listAgentTemplates();
  }

  // ── Execution Engine ──────────────────────────────────────────────────────

  /** POST /api/v1/orgs/me/agents/trigger — fire event → match agents → execute */
  @Post('me/agents-trigger')
  @Roles(...ORG_ADMIN_ROLES)
  triggerEvent(
    @Request() req: AuthReq,
    @Body() body: { eventType: string; payload?: Record<string, unknown> },
  ) {
    return this.agents.triggerAgentsForEvent(
      req.user.organizationId,
      body.eventType,
      body.payload || {},
    );
  }

  /** POST /api/v1/orgs/me/agents/process — flush approved pending executions */
  @Post('me/agents-process')
  @Roles(...ORG_ADMIN_ROLES)
  processQueue(@Request() req: AuthReq) {
    return this.agents.processPendingExecutions(req.user.organizationId);
  }

  // ── Webhook Subscriptions ──────────────────────────────────────────────────

  /** GET /api/v1/orgs/me/agents/:id/subscriptions — list subscriptions for agent */
  @Get('me/agents/:id/subscriptions')
  @Roles(...ORG_ADMIN_ROLES)
  listSubscriptions(@Request() req: AuthReq, @Param('id') agentId: string) {
    return this.agents.listSubscriptions(req.user.organizationId, agentId);
  }

  /** POST /api/v1/orgs/me/agents/:id/subscribe — subscribe agent to event source */
  @Post('me/agents/:id/subscribe')
  @Roles(...ORG_ADMIN_ROLES)
  subscribeAgent(
    @Request() req: AuthReq,
    @Param('id') agentId: string,
    @Body() dto: CreateWebhookSubscriptionDto,
  ) {
    return this.agents.subscribeAgent(
      req.user.organizationId,
      agentId,
      req.user.userId,
      dto,
    );
  }

  /** DELETE /api/v1/orgs/me/agents/subscriptions/:id — unsubscribe from event */
  @Delete('me/agents/subscriptions/:id')
  @Roles(...ORG_ADMIN_ROLES)
  unsubscribeAgent(@Request() req: AuthReq, @Param('id') subscriptionId: string) {
    return this.agents.unsubscribeAgent(
      req.user.organizationId,
      subscriptionId,
      req.user.userId,
    );
  }

  /** PATCH /api/v1/orgs/me/agents/subscriptions/:id — update subscription */
  @Patch('me/agents/subscriptions/:id')
  @Roles(...ORG_ADMIN_ROLES)
  updateSubscription(
    @Request() req: AuthReq,
    @Param('id') subscriptionId: string,
    @Body() dto: UpdateWebhookSubscriptionDto,
  ) {
    return this.agents.updateSubscription(
      req.user.organizationId,
      subscriptionId,
      req.user.userId,
      dto,
    );
  }

  // ── Feedback & Learning ────────────────────────────────────────────────────

  /** POST /api/v1/orgs/me/agents-executions/:id/feedback — rate an execution */
  @Post('me/agents-executions/:id/feedback')
  @Roles(...ORG_ADMIN_ROLES)
  provideFeedback(
    @Request() req: AuthReq,
    @Param('id') executionId: string,
    @Body() dto: ProvideFeedbackDto,
  ) {
    return this.agents.provideFeedback(
      req.user.organizationId,
      executionId,
      req.user.userId,
      req.user.email,
      dto.score,
      dto.comment,
    );
  }

  /** GET /api/v1/orgs/me/agents/:id/feedback-summary — learning metrics per agent */
  @Get('me/agents/:id/feedback-summary')
  @Roles(...ORG_ADMIN_ROLES)
  getAgentFeedbackSummary(@Request() req: AuthReq, @Param('id') agentId: string) {
    return this.agents.getAgentFeedbackSummary(req.user.organizationId, agentId);
  }
}
