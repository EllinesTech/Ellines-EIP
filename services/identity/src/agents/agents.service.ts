import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { ExecuteAgentDto, ApproveExecutionDto } from './dto/execute-agent.dto';
import { CreateWebhookSubscriptionDto, UpdateWebhookSubscriptionDto } from './dto/webhook-subscription.dto';

// ─── Condition evaluator ──────────────────────────────────────────────────────

type Condition = {
  field?: string;
  op?: string;
  value?: unknown;
  and?: Condition[];
  or?: Condition[];
};

function evalCondition(condition: unknown, context: Record<string, unknown>): boolean {
  if (!condition || typeof condition !== 'object') return true; // empty condition = always match

  const cond = condition as Condition;

  // Compound: AND
  if (Array.isArray(cond.and)) {
    return cond.and.every((c) => evalCondition(c, context));
  }

  // Compound: OR
  if (Array.isArray(cond.or)) {
    return cond.or.some((c) => evalCondition(c, context));
  }

  // Simple leaf condition
  const { field, op, value } = cond;
  if (!field || !op) return true;

  const actual = context[field];

  switch (op) {
    case 'eq':  return actual === value;
    case 'neq': return actual !== value;
    case 'gt':  return Number(actual) > Number(value);
    case 'gte': return Number(actual) >= Number(value);
    case 'lt':  return Number(actual) < Number(value);
    case 'lte': return Number(actual) <= Number(value);
    case 'contains':
      return typeof actual === 'string' && actual.toLowerCase().includes(String(value).toLowerCase());
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    default:    return true;
  }
}

// ─── Confidence scoring ────────────────────────────────────────────────────────

function scoreConfidence(
  agent: { condition: unknown; action: unknown; requireApproval: boolean },
  context: Record<string, unknown>,
): { score: number; reasoning: string } {
  // Base confidence: condition match gives 0.8 floor
  const conditionMet = evalCondition(agent.condition, context);
  if (!conditionMet) return { score: 0, reasoning: 'Condition not met' };

  const action = agent.action as Record<string, unknown>;
  const actionType = String(action?.type || '');

  // Higher base confidence for low-risk actions
  const baseScores: Record<string, number> = {
    notify: 0.95,
    escalate: 0.90,
    auto_approve: 0.80,
    reorder: 0.70,
    campaign: 0.65,
    custom: 0.60,
  };

  const base = baseScores[actionType] ?? 0.70;

  // Boost if context has supporting signals
  let boost = 0;
  if (context.ellineaRecommended === true) boost += 0.05;
  if (context.historicalSuccessRate && Number(context.historicalSuccessRate) > 0.9) boost += 0.05;
  if (context.amount && Number(context.amount) < 500) boost += 0.03; // low value = safer

  const score = Math.min(1.0, base + boost);
  const reasoning =
    `Action "${actionType}" — base confidence ${(base * 100).toFixed(0)}%` +
    (boost > 0 ? `, boosted by +${(boost * 100).toFixed(0)}% from context signals` : '') +
    `. Final: ${(score * 100).toFixed(0)}%.`;

  return { score, reasoning };
}

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  async listAgents(organizationId: string) {
    const agents = await this.prisma.ellineaAgent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        trigger: true,
        isActive: true,
        isPaused: true,
        executionCount: true,
        successCount: true,
        lastExecutedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return agents;
  }

  async getAgent(organizationId: string, agentId: string) {
    const agent = await this.prisma.ellineaAgent.findFirst({
      where: { id: agentId, organizationId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    return agent;
  }

  async createAgent(
    organizationId: string,
    userId: string,
    userEmail: string,
    dto: CreateAgentDto,
  ) {
    const agent = await this.prisma.ellineaAgent.create({
      data: {
        organizationId,
        name: dto.name.trim().slice(0, 120),
        description: dto.description?.trim().slice(0, 500) || '',
        templateId: dto.templateId || null,
        trigger: dto.trigger,
        triggerConfig: (dto.triggerConfig || {}) as any,
        condition: (dto.condition || {}) as any,
        action: dto.action as any,
        confidenceThreshold: dto.confidenceThreshold ?? 0.7,
        requireApproval: dto.requireApproval ?? false,
        createdBy: userEmail,
      },
    });

    // Audit log
    await this.prisma.agentAuditLog.create({
      data: {
        agentId: agent.id,
        organizationId,
        userId,
        action: 'agent.created',
        details: { name: agent.name, trigger: agent.trigger } as any,
      },
    });

    return agent;
  }

  async updateAgent(
    organizationId: string,
    agentId: string,
    userId: string,
    dto: UpdateAgentDto,
  ) {
    const existing = await this.prisma.ellineaAgent.findFirst({
      where: { id: agentId, organizationId },
    });

    if (!existing) {
      throw new Error('Agent not found');
    }

    const updated = await this.prisma.ellineaAgent.update({
      where: { id: agentId },
      data: {
        ...(dto.name && { name: dto.name.trim().slice(0, 120) }),
        ...(dto.description !== undefined && { description: dto.description.trim().slice(0, 500) }),
        ...(dto.triggerConfig && { triggerConfig: dto.triggerConfig as any }),
        ...(dto.condition && { condition: dto.condition as any }),
        ...(dto.action && { action: dto.action as any }),
        ...(dto.confidenceThreshold !== undefined && { confidenceThreshold: dto.confidenceThreshold }),
        ...(dto.requireApproval !== undefined && { requireApproval: dto.requireApproval }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isPaused !== undefined && { isPaused: dto.isPaused }),
      } as any,
    });

    // Audit log
    await this.prisma.agentAuditLog.create({
      data: {
        agentId,
        organizationId,
        userId,
        action: 'agent.updated',
        details: { changes: dto } as any,
      },
    });

    return updated;
  }

  async deleteAgent(organizationId: string, agentId: string, userId: string) {
    const existing = await this.prisma.ellineaAgent.findFirst({
      where: { id: agentId, organizationId },
    });

    if (!existing) {
      throw new Error('Agent not found');
    }

    await this.prisma.agentAuditLog.create({
      data: {
        agentId,
        organizationId,
        userId,
        action: 'agent.deleted',
        details: { name: existing.name } as any,
      },
    });

    await this.prisma.ellineaAgent.delete({
      where: { id: agentId },
    });

    return { ok: true };
  }

  async executeAgent(
    organizationId: string,
    agentId: string,
    userId: string,
    dto: ExecuteAgentDto,
  ) {
    const agent = await this.prisma.ellineaAgent.findFirst({
      where: { id: agentId, organizationId, isActive: true },
    });

    if (!agent) {
      throw new Error('Agent not found or inactive');
    }

    if (agent.isPaused) {
      throw new Error('Agent is paused');
    }

    const confidence = dto.confidence ?? 0.5;
    const requiresApproval =
      agent.requireApproval || confidence < agent.confidenceThreshold;

    const execution = await this.prisma.agentExecution.create({
      data: {
        agentId: agent.id,
        organizationId,
        triggeredBy: dto.triggeredBy || 'manual',
        triggerPayload: (dto.triggerPayload || null) as any,
        confidence,
        reasoning: (dto.reasoning || null) as any,
        recommendedAction: dto.recommendedAction || null,
        status: requiresApproval ? 'pending' : 'executed',
        requiresApproval,
        executedAt: requiresApproval ? null : new Date(),
      },
    });

    // Update agent stats
    await this.prisma.ellineaAgent.update({
      where: { id: agent.id },
      data: {
        executionCount: { increment: 1 },
        ...(requiresApproval ? {} : { successCount: { increment: 1 } }),
        lastExecutedAt: new Date(),
      },
    });

    // Audit log
    await this.prisma.agentAuditLog.create({
      data: {
        agentId: agent.id,
        organizationId,
        userId,
        action: 'agent.executed',
        details: { executionId: execution.id, confidence, requiresApproval } as any,
      },
    });

    return execution;
  }

  async listExecutions(organizationId: string, agentId?: string, limit = 50) {
    const executions = await this.prisma.agentExecution.findMany({
      where: {
        organizationId,
        ...(agentId && { agentId }),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        agent: {
          select: { name: true },
        },
      },
    });

    return executions;
  }

  async approveExecution(
    organizationId: string,
    executionId: string,
    userId: string,
    userEmail: string,
    dto: ApproveExecutionDto,
  ) {
    const execution = await this.prisma.agentExecution.findFirst({
      where: { id: executionId, organizationId },
      include: { agent: true },
    });

    if (!execution) {
      throw new Error('Execution not found');
    }

    if (execution.status !== 'pending') {
      throw new Error('Execution is not pending approval');
    }

    const newStatus = dto.decision === 'approved' ? 'executed' : 'rejected';

    const updated = await this.prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        status: newStatus,
        humanApprovalBy: userEmail,
        humanApprovalAt: new Date(),
        humanNote: dto.note || null,
        executedAt: dto.decision === 'approved' ? new Date() : null,
      },
    });

    // Update agent success count if approved
    if (dto.decision === 'approved') {
      await this.prisma.ellineaAgent.update({
        where: { id: execution.agentId },
        data: { successCount: { increment: 1 } },
      });
    }

    // Audit log
    await this.prisma.agentAuditLog.create({
      data: {
        agentId: execution.agentId,
        organizationId,
        userId,
        action: 'agent.approved',
        details: { executionId, decision: dto.decision, note: dto.note } as any,
      },
    });

    return updated;
  }

  async listAgentTemplates() {
    const templates = await this.prisma.agentTemplate.findMany({
      where: { published: true },
      orderBy: [{ featured: 'desc' }, { installCount: 'desc' }],
    });

    return templates;
  }

  // ─── Execution Engine ────────────────────────────────────────────────────

  /**
   * Fan out an enterprise event to all matching agents in the org.
   * Evaluates conditions, scores confidence, and creates executions.
   * Agents below their threshold are queued for human approval.
   */
  async triggerAgentsForEvent(
    organizationId: string,
    eventType: string,
    eventPayload: Record<string, unknown>,
  ) {
    // Find all active agents that match this event trigger
    const agents = await this.prisma.ellineaAgent.findMany({
      where: {
        organizationId,
        isActive: true,
        isPaused: false,
        trigger: eventType,
      },
    });

    if (!agents.length) return { triggered: 0, executions: [] };

    const context: Record<string, unknown> = { ...eventPayload, eventType };
    const executions: unknown[] = [];

    for (const agent of agents) {
      // Evaluate condition
      const conditionMet = evalCondition(agent.condition, context);
      if (!conditionMet) continue;

      // Score confidence
      const { score, reasoning } = scoreConfidence(
        { condition: agent.condition, action: agent.action, requireApproval: agent.requireApproval },
        context,
      );

      const requiresApproval =
        agent.requireApproval || score < agent.confidenceThreshold;

      const execution = await this.prisma.agentExecution.create({
        data: {
          agentId: agent.id,
          organizationId,
          triggeredBy: eventType,
          triggerPayload: eventPayload as any,
          confidence: score,
          reasoning: { summary: reasoning, score, conditionMet: true } as any,
          recommendedAction: String((agent.action as Record<string, unknown>)?.type ?? 'act'),
          status: requiresApproval ? 'pending' : 'executed',
          requiresApproval,
          executedAt: requiresApproval ? null : new Date(),
          canRollback: !requiresApproval,
        },
      });

      // Update agent stats
      await this.prisma.ellineaAgent.update({
        where: { id: agent.id },
        data: {
          executionCount: { increment: 1 },
          ...(!requiresApproval ? { successCount: { increment: 1 } } : {}),
          lastExecutedAt: new Date(),
        },
      });

      // Audit log
      await this.prisma.agentAuditLog.create({
        data: {
          agentId: agent.id,
          organizationId,
          action: 'agent.executed',
          details: { executionId: execution.id, eventType, confidence: score, requiresApproval, reasoning } as any,
        },
      });

      executions.push(execution);
    }

    return { triggered: executions.length, executions };
  }

  /**
   * Process all pending executions for an org — used by a cron or manual flush.
   * Executions that have been approved by a human are marked 'executed'.
   */
  async processPendingExecutions(organizationId: string) {
    const pending = await this.prisma.agentExecution.findMany({
      where: { organizationId, status: 'approved' },
      include: { agent: true },
    });

    for (const exec of pending) {
      await this.prisma.agentExecution.update({
        where: { id: exec.id },
        data: { status: 'executed', executedAt: new Date() },
      });

      await this.prisma.agentAuditLog.create({
        data: {
          agentId: exec.agentId,
          organizationId,
          action: 'agent.executed',
          details: { executionId: exec.id, processedAt: new Date().toISOString() } as any,
        },
      });
    }

    return { processed: pending.length };
  }

  // ─── Webhook Subscriptions ────────────────────────────────────────────────

  /**
   * Subscribe an agent to an external event source (connector, webhook, system event).
   */
  async subscribeAgent(
    organizationId: string,
    agentId: string,
    userId: string,
    dto: CreateWebhookSubscriptionDto,
  ) {
    const agent = await this.prisma.ellineaAgent.findFirst({
      where: { id: agentId, organizationId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    const subscription = await this.prisma.agentWebhookSubscription.create({
      data: {
        agentId,
        organizationId,
        eventSource: dto.eventSource,
        eventSourceId: dto.eventSourceId || null,
        eventType: dto.eventType,
        filter: (dto.filter || {}) as any,
      },
    });

    // Audit log
    await this.prisma.agentAuditLog.create({
      data: {
        agentId: subscription.agentId,
        organizationId,
        userId,
        action: 'agent.subscribed',
        details: { subscriptionId: subscription.id, eventSource: dto.eventSource, eventType: dto.eventType } as any,
      },
    });

    return subscription;
  }

  /**
   * List all webhook subscriptions for an agent.
   */
  async listSubscriptions(organizationId: string, agentId: string) {
    const subscriptions = await this.prisma.agentWebhookSubscription.findMany({
      where: { agentId, organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return subscriptions;
  }

  /**
   * Unsubscribe an agent from an event source.
   */
  async unsubscribeAgent(
    organizationId: string,
    subscriptionId: string,
    userId: string,
  ) {
    const subscription = await this.prisma.agentWebhookSubscription.findFirst({
      where: { id: subscriptionId, organizationId },
      include: { agent: true },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    await this.prisma.agentAuditLog.create({
      data: {
        agentId: subscription.agentId,
        organizationId,
        userId,
        action: 'agent.unsubscribed',
        details: {
          subscriptionId,
          eventSource: subscription.eventSource,
          eventType: subscription.eventType,
        } as any,
      },
    });

    await this.prisma.agentWebhookSubscription.delete({
      where: { id: subscriptionId },
    });

    return { ok: true };
  }

  /**
   * Update webhook subscription status or filters.
   */
  async updateSubscription(
    organizationId: string,
    subscriptionId: string,
    userId: string,
    dto: UpdateWebhookSubscriptionDto,
  ) {
    const subscription = await this.prisma.agentWebhookSubscription.findFirst({
      where: { id: subscriptionId, organizationId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const updated = await this.prisma.agentWebhookSubscription.update({
      where: { id: subscriptionId },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.filter && { filter: dto.filter as any }),
      },
    });

    // Audit log
    await this.prisma.agentAuditLog.create({
      data: {
        agentId: subscription.agentId,
        organizationId,
        userId,
        action: 'agent.subscription_updated',
        details: { subscriptionId, changes: dto } as any,
      },
    });

    return updated;
  }

  /**
   * Trigger agents by webhook event from connector or external source.
   * Finds matching subscriptions and fires agent execution engine.
   */
  async triggerByWebhookEvent(
    organizationId: string,
    eventSource: string,
    eventSourceId: string | null,
    eventType: string,
    eventPayload: Record<string, unknown>,
  ) {
    // Find all active subscriptions for this event
    const subscriptions = await this.prisma.agentWebhookSubscription.findMany({
      where: {
        organizationId,
        isActive: true,
        eventSource,
        eventSourceId,
        eventType,
      },
      include: { agent: true },
    });

    if (!subscriptions.length) {
      return { triggered: 0, executions: [] };
    }

    const context: Record<string, unknown> = {
      ...eventPayload,
      eventSource,
      eventSourceId,
      eventType,
    };

    const executions: unknown[] = [];

    for (const sub of subscriptions) {
      const agent = sub.agent;

      // Check filters if present
      if (sub.filter && typeof sub.filter === 'object') {
        const filter = sub.filter as Record<string, unknown>;
        let filterMatch = true;

        for (const [key, value] of Object.entries(filter)) {
          if (context[key] !== value) {
            filterMatch = false;
            break;
          }
        }

        if (!filterMatch) continue;
      }

      // Evaluate condition
      const conditionMet = evalCondition(agent.condition, context);
      if (!conditionMet) continue;

      // Score confidence
      const { score, reasoning } = scoreConfidence(
        { condition: agent.condition, action: agent.action, requireApproval: agent.requireApproval },
        context,
      );

      const requiresApproval =
        agent.requireApproval || score < agent.confidenceThreshold;

      const execution = await this.prisma.agentExecution.create({
        data: {
          agentId: agent.id,
          organizationId,
          triggeredBy: `${eventSource}:${eventType}`,
          triggerPayload: eventPayload as any,
          confidence: score,
          reasoning: { summary: reasoning, score, conditionMet: true, subscriptionId: sub.id } as any,
          recommendedAction: String((agent.action as Record<string, unknown>)?.type ?? 'act'),
          status: requiresApproval ? 'pending' : 'executed',
          requiresApproval,
          executedAt: requiresApproval ? null : new Date(),
          canRollback: !requiresApproval,
        },
      });

      // Update agent stats
      await this.prisma.ellineaAgent.update({
        where: { id: agent.id },
        data: {
          executionCount: { increment: 1 },
          ...(!requiresApproval ? { successCount: { increment: 1 } } : {}),
          lastExecutedAt: new Date(),
        },
      });

      // Audit log
      await this.prisma.agentAuditLog.create({
        data: {
          agentId: agent.id,
          organizationId,
          action: 'agent.webhook_triggered',
          details: {
            executionId: execution.id,
            eventSource,
            eventType,
            confidence: score,
            requiresApproval,
            reasoning,
          } as any,
        },
      });

      executions.push(execution);
    }

    return { triggered: executions.length, executions };
  }

  // ─── Feedback & Learning ──────────────────────────────────────────────────

  /**
   * Capture user feedback on an agent execution for learning/retraining.
   * Feedback is used to update agent DNA and confidence scoring over time.
   */
  async provideFeedback(
    organizationId: string,
    executionId: string,
    userId: string,
    userEmail: string,
    score: -1 | 0 | 1,
    comment?: string,
  ) {
    const execution = await this.prisma.agentExecution.findFirst({
      where: { id: executionId, organizationId },
      include: { agent: true },
    });

    if (!execution) {
      throw new Error('Execution not found');
    }

    const updated = await this.prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        feedbackScore: score,
        feedbackComment: comment || null,
        feedbackAt: new Date(),
        feedbackBy: userEmail,
      },
    });

    // Audit log
    await this.prisma.agentAuditLog.create({
      data: {
        agentId: execution.agentId,
        organizationId,
        userId,
        action: 'agent.feedback_provided',
        details: {
          executionId,
          score,
          comment,
          confidence: execution.confidence,
        } as any,
      },
    });

    return updated;
  }

  /**
   * Get feedback summary for an agent (avg score, distribution, recent comments).
   * Used to assess agent quality and identify improvement areas.
   */
  async getAgentFeedbackSummary(organizationId: string, agentId: string) {
    const feedbackItems = await this.prisma.agentExecution.findMany({
      where: { agentId, organizationId, feedbackScore: { not: null } },
      select: { feedbackScore: true, feedbackComment: true, feedbackAt: true, confidence: true },
      orderBy: { feedbackAt: 'desc' },
      take: 100,
    });

    if (!feedbackItems.length) {
      return {
        totalFeedback: 0,
        averageScore: 0,
        helpful: 0,
        neutral: 0,
        unhelpful: 0,
        recentComments: [],
      };
    }

    const helpful = feedbackItems.filter((f) => f.feedbackScore === 1).length;
    const neutral = feedbackItems.filter((f) => f.feedbackScore === 0).length;
    const unhelpful = feedbackItems.filter((f) => f.feedbackScore === -1).length;

    const avgScore = feedbackItems.reduce((sum, f) => sum + (f.feedbackScore || 0), 0) / feedbackItems.length;

    const recentComments = feedbackItems
      .filter((f) => f.feedbackComment)
      .slice(0, 10)
      .map((f) => ({ score: f.feedbackScore, comment: f.feedbackComment, at: f.feedbackAt }));

    return {
      totalFeedback: feedbackItems.length,
      averageScore: Number(avgScore.toFixed(2)),
      helpful,
      neutral,
      unhelpful,
      recentComments,
    };
  }
}
