import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { RuleService } from './rule.service';

@Controller('workflows/rules')
export class RuleController {
  constructor(private ruleService: RuleService) {}

  /**
   * GET /api/v1/workflows/rules
   * List all rules for an organization
   */
  @Get()
  async listRules(
    @Body() body: { organizationId: string },
    @Query('autonomyLevel') autonomyLevel?: string,
  ) {
    const level = autonomyLevel ? parseInt(autonomyLevel) : undefined;
    return this.ruleService.listRules(body.organizationId, level);
  }

  /**
   * POST /api/v1/workflows/rules
   * Create a new rule
   */
  @Post()
  async createRule(
    @Body()
    input: {
      organizationId: string;
      name: string;
      description?: string;
      autonomyLevel: number;
      trigger: string;
      condition: Record<string, any>;
      action: Record<string, any>;
      isActive?: boolean;
      createdBy: string;
    },
  ) {
    return this.ruleService.createRule(
      input.organizationId,
      input,
      input.createdBy,
    );
  }

  /**
   * GET /api/v1/workflows/rules/:id
   * Get a single rule
   */
  @Get(':id')
  async getRule(
    @Param('id') id: string,
    @Body() body: { organizationId: string },
  ) {
    return this.ruleService.getRule(id, body.organizationId);
  }

  /**
   * PATCH /api/v1/workflows/rules/:id
   * Update a rule
   */
  @Patch(':id')
  async updateRule(
    @Param('id') id: string,
    @Body()
    input: {
      organizationId: string;
      name?: string;
      description?: string;
      autonomyLevel?: number;
      condition?: Record<string, any>;
      action?: Record<string, any>;
      isActive?: boolean;
    },
  ) {
    return this.ruleService.updateRule(id, input.organizationId, input);
  }

  /**
   * DELETE /api/v1/workflows/rules/:id
   * Delete a rule
   */
  @Delete(':id')
  async deleteRule(
    @Param('id') id: string,
    @Body() body: { organizationId: string },
  ) {
    await this.ruleService.deleteRule(id, body.organizationId);
    return { ok: true };
  }

  /**
   * POST /api/v1/workflows/rules/:id/dry-run
   * Test a rule without executing it
   */
  @Post(':id/dry-run')
  async dryRunRule(
    @Param('id') ruleId: string,
    @Body()
    input: {
      organizationId: string;
      context: Record<string, any>;
    },
  ) {
    return this.ruleService.dryRunRule(ruleId, input.organizationId, input.context);
  }

  /**
   * POST /api/v1/workflows/rules/:id/schedule
   * Add a cron schedule to a rule
   */
  @Post(':id/schedule')
  async addSchedule(
    @Param('id') ruleId: string,
    @Body()
    input: {
      organizationId: string;
      cronExpression: string;
      timezone?: string;
    },
  ) {
    return this.ruleService.addSchedule(
      ruleId,
      input.organizationId,
      input.cronExpression,
      input.timezone,
    );
  }

  /**
   * GET /api/v1/workflows/executions
   * Get execution history for an organization
   */
  @Get('executions')
  async getExecutionHistory(
    @Body() body: { organizationId: string },
    @Query('ruleId') ruleId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ruleService.getExecutionHistory(
      body.organizationId,
      ruleId,
      limit ? parseInt(limit) : 50,
    );
  }

  /**
   * POST /api/v1/workflows/executions/:id/approve
   * Approve a pending execution
   */
  @Post('executions/:id/approve')
  async approveExecution(
    @Param('id') executionId: string,
    @Body()
    input: {
      organizationId: string;
      approvedBy: string;
    },
  ) {
    return this.ruleService.approveExecution(
      executionId,
      input.organizationId,
      input.approvedBy,
    );
  }

  /**
   * POST /api/v1/workflows/executions/:id/reject
   * Reject a pending execution
   */
  @Post('executions/:id/reject')
  async rejectExecution(
    @Param('id') executionId: string,
    @Body()
    input: {
      organizationId: string;
      rejectedBy: string;
    },
  ) {
    return this.ruleService.rejectExecution(
      executionId,
      input.organizationId,
      input.rejectedBy,
    );
  }
}
