import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { ExecuteAgentDto, ApproveExecutionDto } from './dto/execute-agent.dto';

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
        triggerConfig: dto.triggerConfig || {},
        condition: dto.condition || {},
        action: dto.action,
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
        details: { name: agent.name, trigger: agent.trigger },
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
        ...(dto.description !== undefined && {
          description: dto.description.trim().slice(0, 500),
        }),
        ...(dto.triggerConfig && { triggerConfig: dto.triggerConfig }),
        ...(dto.condition && { condition: dto.condition }),
        ...(dto.action && { action: dto.action }),
        ...(dto.confidenceThreshold !== undefined && {
          confidenceThreshold: dto.confidenceThreshold,
        }),
        ...(dto.requireApproval !== undefined && {
          requireApproval: dto.requireApproval,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isPaused !== undefined && { isPaused: dto.isPaused }),
      },
    });

    // Audit log
    await this.prisma.agentAuditLog.create({
      data: {
        agentId,
        organizationId,
        userId,
        action: 'agent.updated',
        details: { changes: dto },
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
        details: { name: existing.name },
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
        triggerPayload: dto.triggerPayload || null,
        confidence,
        reasoning: dto.reasoning || null,
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
        details: {
          executionId: execution.id,
          confidence,
          requiresApproval,
        },
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
        details: {
          executionId,
          decision: dto.decision,
          note: dto.note,
        },
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
}
