import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowRule, RuleExecution, RuleSchedule, Prisma } from '@prisma/client';

@Injectable()
export class RuleService {
  constructor(private prisma: PrismaService) {}

  /**
   * List all rules for an organization
   */
  async listRules(organizationId: string, autonomyLevel?: number): Promise<WorkflowRule[]> {
    const where: Prisma.WorkflowRuleWhereInput = {
      organizationId,
      ...(autonomyLevel !== undefined && { autonomyLevel }),
    };

    return this.prisma.workflowRule.findMany({
      where,
      include: { executions: { orderBy: { triggeredAt: 'desc' }, take: 5 }, schedules: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single rule by ID
   */
  async getRule(id: string, organizationId: string): Promise<WorkflowRule> {
    const rule = await this.prisma.workflowRule.findFirst({
      where: { id, organizationId },
      include: { executions: { orderBy: { triggeredAt: 'desc' } }, schedules: true },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${id} not found`);
    }

    return rule;
  }

  /**
   * Create a new rule
   */
  async createRule(
    organizationId: string,
    input: {
      name: string;
      description?: string;
      autonomyLevel: number; // 1 | 2 | 3
      trigger: string;
      condition: Record<string, any>;
      action: Record<string, any>;
      isActive?: boolean;
    },
    createdBy: string,
  ): Promise<WorkflowRule> {
    if (![1, 2, 3].includes(input.autonomyLevel)) {
      throw new BadRequestException('Autonomy level must be 1, 2, or 3');
    }

    return this.prisma.workflowRule.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description || '',
        autonomyLevel: input.autonomyLevel,
        trigger: input.trigger,
        condition: input.condition,
        action: input.action,
        isActive: input.isActive ?? true,
        createdBy,
      },
    });
  }

  /**
   * Update a rule
   */
  async updateRule(
    id: string,
    organizationId: string,
    input: Partial<Omit<WorkflowRule, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'updatedAt'>>,
  ): Promise<WorkflowRule> {
    return this.prisma.workflowRule.update({
      where: { id },
      data: input,
    });
  }

  /**
   * Delete a rule
   */
  async deleteRule(id: string, organizationId: string): Promise<void> {
    await this.getRule(id, organizationId); // Verify access
    await this.prisma.workflowRule.delete({ where: { id } });
  }

  /**
   * Evaluate a rule condition against context
   */
  evaluateCondition(condition: Record<string, any>, context: Record<string, any>): boolean {
    if (!condition || Object.keys(condition).length === 0) {
      return true; // Empty condition = always true
    }

    const { field, op, value } = condition;

    if (!field || !op) {
      return true;
    }

    const contextValue = this.getNestedValue(context, field);

    switch (op) {
      case 'eq':
        return contextValue === value;
      case 'neq':
        return contextValue !== value;
      case 'gt':
        return contextValue > value;
      case 'gte':
        return contextValue >= value;
      case 'lt':
        return contextValue < value;
      case 'lte':
        return contextValue <= value;
      case 'in':
        return (Array.isArray(value) && value.includes(contextValue)) || false;
      case 'nin':
        return !(Array.isArray(value) && value.includes(contextValue));
      default:
        return false;
    }
  }

  /**
   * Get a nested value from object (e.g., "approval.status" → obj.approval.status)
   */
  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Execute a rule (simulate action based on rule type)
   */
  async executeRule(
    ruleId: string,
    context: Record<string, any>,
  ): Promise<{ success: boolean; message: string }> {
    const rule = await this.prisma.workflowRule.findUnique({ where: { id: ruleId } });

    if (!rule) {
      return { success: false, message: 'Rule not found' };
    }

    if (!rule.isActive) {
      return { success: false, message: 'Rule is not active' };
    }

    // Evaluate condition
    const conditionMet = this.evaluateCondition(rule.condition, context);

    if (!conditionMet) {
      return { success: false, message: 'Condition not met' };
    }

    // Log execution
    const execution = await this.prisma.ruleExecution.create({
      data: {
        ruleId,
        triggeredAt: new Date(),
        status: rule.autonomyLevel === 2 ? 'pending' : 'executed',
        aiRecommendation: { recommendation: `Auto ${rule.action.type}`, confidence: 0.85 },
        executedAt: rule.autonomyLevel === 2 ? null : new Date(),
      },
    });

    return {
      success: true,
      message: `Rule executed (autonomy level ${rule.autonomyLevel}): ${rule.action.type}`,
    };
  }

  /**
   * Dry-run a rule (test without executing)
   */
  async dryRunRule(
    ruleId: string,
    organizationId: string,
    context: Record<string, any>,
  ): Promise<{
    conditionMet: boolean;
    action: Record<string, any>;
    message: string;
  }> {
    const rule = await this.getRule(ruleId, organizationId);

    const conditionMet = this.evaluateCondition(rule.condition, context);

    return {
      conditionMet,
      action: rule.action,
      message: conditionMet
        ? `Condition met. Action: ${JSON.stringify(rule.action)}`
        : 'Condition not met',
    };
  }

  /**
   * Add a cron schedule to a Level 3 rule
   */
  async addSchedule(
    ruleId: string,
    organizationId: string,
    cronExpression: string,
    timezone: string = 'UTC',
  ): Promise<RuleSchedule> {
    const rule = await this.getRule(ruleId, organizationId);

    if (rule.autonomyLevel !== 3) {
      throw new BadRequestException('Only Level 3 (Scheduled) rules can have cron schedules');
    }

    // Delete existing schedule if any
    await this.prisma.ruleSchedule.deleteMany({ where: { ruleId } });

    return this.prisma.ruleSchedule.create({
      data: {
        ruleId,
        cronExpression,
        timezone,
        nextRun: new Date(Date.now() + 60 * 1000), // Next run in 1 minute
      },
    });
  }

  /**
   * Get rule execution history
   */
  async getExecutionHistory(
    organizationId: string,
    ruleId?: string,
    limit = 50,
  ): Promise<RuleExecution[]> {
    const where: Prisma.RuleExecutionWhereInput = ruleId
      ? { rule: { id: ruleId, organizationId } }
      : { rule: { organizationId } };

    return this.prisma.ruleExecution.findMany({
      where,
      orderBy: { triggeredAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Approve a pending execution
   */
  async approveExecution(
    executionId: string,
    organizationId: string,
    approvedBy: string,
  ): Promise<RuleExecution> {
    const execution = await this.prisma.ruleExecution.findFirst({
      where: { id: executionId, rule: { organizationId } },
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    return this.prisma.ruleExecution.update({
      where: { id: executionId },
      data: {
        status: 'approved',
        humanApprovalBy: approvedBy,
        humanApprovalAt: new Date(),
        executedAt: new Date(),
      },
    });
  }

  /**
   * Reject a pending execution
   */
  async rejectExecution(
    executionId: string,
    organizationId: string,
    rejectedBy: string,
  ): Promise<RuleExecution> {
    const execution = await this.prisma.ruleExecution.findFirst({
      where: { id: executionId, rule: { organizationId } },
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    return this.prisma.ruleExecution.update({
      where: { id: executionId },
      data: {
        status: 'rejected',
        humanApprovalBy: rejectedBy,
        humanApprovalAt: new Date(),
      },
    });
  }
}
