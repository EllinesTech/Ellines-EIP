import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { CreateRuleDto } from './dto/create-rule.dto';
import { CreateReportDto } from './dto/create-report.dto';

// ─── Approval step templates ────────────────────────────────────────────────

type StepTemplate = { key: string; label: string; actorRole: string; stepOrder: number };

const TEMPLATES: Record<string, StepTemplate[]> = {
  simple: [{ key: 'owner_decide', label: 'Decide', actorRole: 'decider', stepOrder: 0 }],
  it_then_owner: [
    { key: 'it_review', label: 'IT review', actorRole: 'admin', stepOrder: 0 },
    { key: 'owner_decide', label: 'Owner decide', actorRole: 'owner', stepOrder: 1 },
  ],
  manager_exec_owner: [
    { key: 'manager_review', label: 'Manager review', actorRole: 'manager', stepOrder: 0 },
    { key: 'exec_review', label: 'Executive review', actorRole: 'executive', stepOrder: 1 },
    { key: 'owner_decide', label: 'Owner decide', actorRole: 'owner', stepOrder: 2 },
  ],
};

function stepsForTemplate(templateId: string): StepTemplate[] {
  return TEMPLATES[templateId] ?? TEMPLATES['simple'];
}

function roleCanActOnStep(role: string, actorRole: string): boolean {
  if (actorRole === 'decider') return ['owner', 'admin', 'executive', 'manager'].includes(role);
  if (actorRole === 'admin') return role === 'admin' || role === 'owner';
  if (actorRole === 'owner') return role === 'owner';
  if (actorRole === 'executive') return role === 'executive' || role === 'owner';
  if (actorRole === 'manager') return ['manager', 'executive', 'owner'].includes(role);
  return false;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Approvals ─────────────────────────────────────────────────────────────

  async listApprovals(organizationId: string) {
    const items = await this.prisma.approvalRequest.findMany({
      where: { organizationId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    return items.map(this.serializeApproval);
  }

  async createApproval(
    organizationId: string,
    actorId: string,
    actorName: string,
    dto: CreateApprovalDto,
  ) {
    const stepTemplates = stepsForTemplate(dto.templateId);
    const approval = await this.prisma.approvalRequest.create({
      data: {
        organizationId,
        title: dto.title,
        detail: dto.detail || '',
        requester: actorName,
        status: 'pending',
        templateId: dto.templateId,
        currentStepIndex: 0,
        source: dto.source || 'manual',
        steps: {
          create: stepTemplates.map((s) => ({
            key: s.key,
            label: s.label,
            status: 'pending',
            actorRole: s.actorRole,
            stepOrder: s.stepOrder,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action: 'workflow.approval_created',
        resource: 'approval_request',
        metadata: { id: approval.id, title: approval.title, templateId: approval.templateId },
      },
    });

    // Publish event
    await this.publishEvent(organizationId, 'approval.created', {
      approvalId: approval.id,
      title: approval.title,
      templateId: approval.templateId,
    });

    return this.serializeApproval(approval);
  }

  async decideApproval(
    organizationId: string,
    approvalId: string,
    actorId: string,
    actorRole: string,
    dto: DecideApprovalDto,
  ) {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id: approvalId, organizationId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!approval) throw new NotFoundException('Approval not found');
    if (approval.status !== 'pending') {
      throw new ForbiddenException('Approval is already decided');
    }

    const step = approval.steps[approval.currentStepIndex];
    if (!step) throw new NotFoundException('Current step not found');
    if (!roleCanActOnStep(actorRole, step.actorRole)) {
      throw new ForbiddenException(`Your role (${actorRole}) cannot act on this step`);
    }

    const now = new Date();
    const actorName = dto.actorName || actorRole;

    // Mark current step decided
    await this.prisma.approvalStep.update({
      where: { id: step.id },
      data: {
        status: dto.decision,
        decidedBy: actorName,
        decidedAt: now,
      },
    });

    let nextStatus = approval.status as string;
    let nextStepIndex = approval.currentStepIndex;
    let decidedAt: Date | null = null;
    let decidedBy: string | null = null;

    if (dto.decision === 'rejected') {
      nextStatus = 'rejected';
      decidedAt = now;
      decidedBy = actorName;
    } else {
      const nextIdx = approval.currentStepIndex + 1;
      if (nextIdx >= approval.steps.length) {
        nextStatus = 'approved';
        decidedAt = now;
        decidedBy = actorName;
      } else {
        nextStatus = 'pending';
        nextStepIndex = nextIdx;
      }
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id: approvalId },
      data: {
        status: nextStatus,
        currentStepIndex: nextStepIndex,
        ...(decidedAt ? { decidedAt, decidedBy } : {}),
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action: `workflow.approval_${dto.decision}`,
        resource: 'approval_request',
        metadata: {
          id: approvalId,
          title: approval.title,
          decision: dto.decision,
          step: step.key,
          overall: nextStatus,
        },
      },
    });

    await this.publishEvent(organizationId, `approval.${dto.decision}`, {
      approvalId,
      title: approval.title,
      step: step.key,
      overall: nextStatus,
    });

    return this.serializeApproval(updated);
  }

  private serializeApproval(
    approval: {
      id: string; organizationId: string; title: string; detail: string;
      requester: string; status: string; templateId: string;
      currentStepIndex: number; source: string;
      decidedAt: Date | null; decidedBy: string | null;
      createdAt: Date; updatedAt: Date;
      steps: {
        id: string; key: string; label: string; status: string;
        actorRole: string; stepOrder: number;
        decidedBy: string | null; decidedAt: Date | null;
      }[];
    },
  ) {
    return {
      id: approval.id,
      title: approval.title,
      detail: approval.detail,
      requester: approval.requester,
      status: approval.status,
      templateId: approval.templateId,
      currentStepIndex: approval.currentStepIndex,
      source: approval.source,
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      decidedBy: approval.decidedBy,
      createdAt: approval.createdAt.toISOString(),
      steps: approval.steps.map((s) => ({
        key: s.key,
        label: s.label,
        status: s.status,
        actorRole: s.actorRole,
        decidedBy: s.decidedBy,
        decidedAt: s.decidedAt?.toISOString() ?? null,
      })),
    };
  }

  // ── Business Rules ────────────────────────────────────────────────────────

  async listRules(organizationId: string) {
    const rules = await this.prisma.businessRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rules.map(this.serializeRule);
  }

  async createRule(organizationId: string, actorId: string, dto: CreateRuleDto) {
    const rule = await this.prisma.businessRule.create({
      data: {
        organizationId,
        name: dto.name,
        enabled: true,
        when: dto.when,
        threshold: dto.threshold,
        then: dto.then,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action: 'workflow.rule_created',
        resource: 'business_rule',
        metadata: { id: rule.id, name: rule.name },
      },
    });
    await this.publishEvent(organizationId, 'rules.updated', { count: 1 });
    return this.serializeRule(rule);
  }

  async toggleRule(
    organizationId: string,
    ruleId: string,
    actorId: string,
    enabled: boolean,
  ) {
    const existing = await this.prisma.businessRule.findFirst({
      where: { id: ruleId, organizationId },
    });
    if (!existing) throw new NotFoundException('Rule not found');
    const rule = await this.prisma.businessRule.update({
      where: { id: ruleId },
      data: { enabled },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action: 'workflow.rule_updated',
        resource: 'business_rule',
        metadata: { id: ruleId, enabled },
      },
    });
    return this.serializeRule(rule);
  }

  async deleteRule(organizationId: string, ruleId: string, actorId: string) {
    const existing = await this.prisma.businessRule.findFirst({
      where: { id: ruleId, organizationId },
    });
    if (!existing) throw new NotFoundException('Rule not found');
    await this.prisma.businessRule.delete({ where: { id: ruleId } });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action: 'workflow.rule_deleted',
        resource: 'business_rule',
        metadata: { id: ruleId },
      },
    });
    return { ok: true };
  }

  private serializeRule(rule: {
    id: string; name: string; enabled: boolean; when: string;
    threshold: number; then: string; createdAt: Date;
  }) {
    return {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      when: rule.when,
      threshold: rule.threshold,
      then: rule.then,
      createdAt: rule.createdAt.toISOString(),
    };
  }

  // ── Scheduled Reports ─────────────────────────────────────────────────────

  async listReports(organizationId: string) {
    const reports = await this.prisma.scheduledReport.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return reports.map(this.serializeReport);
  }

  async createReport(organizationId: string, actorId: string, dto: CreateReportDto) {
    const report = await this.prisma.scheduledReport.create({
      data: {
        organizationId,
        title: dto.title,
        cadence: dto.cadence,
        enabled: true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action: 'workflow.report_created',
        resource: 'scheduled_report',
        metadata: { id: report.id, title: report.title, cadence: report.cadence },
      },
    });
    return this.serializeReport(report);
  }

  async runReport(organizationId: string, reportId: string, actorId: string) {
    const existing = await this.prisma.scheduledReport.findFirst({
      where: { id: reportId, organizationId },
    });
    if (!existing) throw new NotFoundException('Report not found');
    const report = await this.prisma.scheduledReport.update({
      where: { id: reportId },
      data: { lastRunAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action: 'workflow.report_run',
        resource: 'scheduled_report',
        metadata: { id: reportId },
      },
    });
    await this.publishEvent(organizationId, 'report.run', { reportId, title: report.title });
    return this.serializeReport(report);
  }

  async toggleReport(
    organizationId: string,
    reportId: string,
    actorId: string,
    enabled: boolean,
  ) {
    const existing = await this.prisma.scheduledReport.findFirst({
      where: { id: reportId, organizationId },
    });
    if (!existing) throw new NotFoundException('Report not found');
    const report = await this.prisma.scheduledReport.update({
      where: { id: reportId },
      data: { enabled },
    });
    return this.serializeReport(report);
  }

  async deleteReport(organizationId: string, reportId: string, actorId: string) {
    const existing = await this.prisma.scheduledReport.findFirst({
      where: { id: reportId, organizationId },
    });
    if (!existing) throw new NotFoundException('Report not found');
    await this.prisma.scheduledReport.delete({ where: { id: reportId } });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action: 'workflow.report_deleted',
        resource: 'scheduled_report',
        metadata: { id: reportId },
      },
    });
    return { ok: true };
  }

  private serializeReport(report: {
    id: string; title: string; cadence: string; enabled: boolean;
    lastRunAt: Date | null; createdAt: Date;
  }) {
    const nextRunHint = report.enabled
      ? report.cadence === 'daily'
        ? 'Tomorrow morning'
        : 'Next Monday'
      : 'Paused';
    return {
      id: report.id,
      title: report.title,
      cadence: report.cadence,
      enabled: report.enabled,
      lastRunAt: report.lastRunAt?.toISOString() ?? null,
      nextRunHint,
      createdAt: report.createdAt.toISOString(),
    };
  }

  // ── Event Bus ─────────────────────────────────────────────────────────────

  async listEvents(organizationId: string, limit = 100) {
    const events = await this.prisma.enterpriseEvent.findMany({
      where: { organizationId },
      orderBy: { at: 'desc' },
      take: Math.min(limit, 200),
    });
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      payload: e.payload,
      at: e.at.toISOString(),
    }));
  }

  async publishEvent(
    organizationId: string,
    type: string,
    payload: Record<string, unknown> = {},
  ) {
    const event = await this.prisma.enterpriseEvent.create({
      data: { organizationId, type, payload: payload as object },
    });
    return { id: event.id, type: event.type, at: event.at.toISOString() };
  }
}
