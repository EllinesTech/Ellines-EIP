/**
 * WorkflowService tests
 */
import { NotFoundException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma(overrides: Record<string, any> = {}) {
  const base = {
    approvalRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'apr-1', organizationId: 'org-1', title: 'Test', detail: '',
        requester: 'Alice', status: 'pending', templateId: 'simple',
        currentStepIndex: 0, source: 'manual', createdAt: new Date(), updatedAt: new Date(),
        steps: [{ id: 's1', key: 'owner_decide', label: 'Decide', status: 'pending', actorRole: 'decider', stepOrder: 0 }],
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    enterpriseEvent: {
      create: jest.fn().mockResolvedValue({ id: 'ev-1', type: 'test', at: new Date() }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    businessRule: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'R1', enabled: true, when: 'approval.created', threshold: 0, then: 'notify', createdAt: new Date() }),
      update: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'R1', enabled: false, when: 'approval.created', threshold: 0, then: 'notify', createdAt: new Date() }),
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    scheduledReport: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'rep-1', title: 'Monthly', cadence: 'monthly', enabled: true, lastRunAt: null, createdAt: new Date() }),
      update: jest.fn().mockResolvedValue({ id: 'rep-1', title: 'Monthly', cadence: 'monthly', enabled: false, lastRunAt: null, createdAt: new Date() }),
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  return { ...base, ...overrides } as unknown as PrismaService;
}

// ─── createApproval ──────────────────────────────────────────────────────────
describe('WorkflowService.createApproval', () => {
  it('creates approval with simple template', async () => {
    const prisma = makePrisma();
    const svc = new WorkflowService(prisma);
    await svc.createApproval('org-1', 'user-1', 'Alice', { title: 'Buy laptop', templateId: 'simple' } as any);
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Buy laptop', status: 'pending',
          steps: expect.objectContaining({ create: expect.arrayContaining([expect.objectContaining({ key: 'owner_decide' })]) }),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('creates it_then_owner template with 2 steps', async () => {
    const prisma = makePrisma({
      approvalRequest: {
        ...makePrisma().approvalRequest,
        create: jest.fn().mockResolvedValue({
          id: 'apr-2', title: 'IT', detail: '', requester: 'Bob', status: 'pending',
          templateId: 'it_then_owner', currentStepIndex: 0, source: 'manual',
          createdAt: new Date(), updatedAt: new Date(),
          steps: [
            { key: 'it_review', actorRole: 'admin', stepOrder: 0 },
            { key: 'owner_decide', actorRole: 'owner', stepOrder: 1 },
          ],
        }),
      },
    });
    const svc = new WorkflowService(prisma);
    await svc.createApproval('org-1', 'user-1', 'Bob', { title: 'IT', templateId: 'it_then_owner' } as any);
    const createCall = (prisma.approvalRequest.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.steps.create).toHaveLength(2);
  });

  it('falls back to simple for unknown templateId', async () => {
    const prisma = makePrisma();
    const svc = new WorkflowService(prisma);
    await svc.createApproval('org-1', 'u1', 'Alice', { title: 'Test', templateId: 'nonexistent' } as any);
    const createCall = (prisma.approvalRequest.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.steps.create).toHaveLength(1);
  });
});

// ─── listApprovals ────────────────────────────────────────────────────────────
describe('WorkflowService.listApprovals', () => {
  it('returns empty array', async () => {
    const svc = new WorkflowService(makePrisma());
    expect(await svc.listApprovals('org-1')).toEqual([]);
  });
});

// ─── createRule ───────────────────────────────────────────────────────────────
describe('WorkflowService.createRule', () => {
  it('creates rule and logs audit', async () => {
    const prisma = makePrisma();
    const svc = new WorkflowService(prisma);
    await svc.createRule('org-1', 'user-1', { name: 'Notify', when: 'approval.created', threshold: 0, then: 'notify' } as any);
    expect(prisma.businessRule.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});

// ─── toggleRule ───────────────────────────────────────────────────────────────
describe('WorkflowService.toggleRule', () => {
  it('throws NotFoundException for missing rule', async () => {
    const svc = new WorkflowService(makePrisma());
    await expect(svc.toggleRule('org-1', 'r-missing', 'user-1', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates rule enabled flag', async () => {
    const prisma = makePrisma({
      businessRule: { ...makePrisma().businessRule, findFirst: jest.fn().mockResolvedValue({ id: 'r1', name: 'R1' }) },
    });
    const svc = new WorkflowService(prisma);
    await svc.toggleRule('org-1', 'r1', 'user-1', false);
    expect(prisma.businessRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: { enabled: false } }),
    );
  });
});

// ─── deleteRule ───────────────────────────────────────────────────────────────
describe('WorkflowService.deleteRule', () => {
  it('throws NotFoundException for missing rule', async () => {
    const svc = new WorkflowService(makePrisma());
    await expect(svc.deleteRule('org-1', 'r-missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes existing rule', async () => {
    const prisma = makePrisma({
      businessRule: { ...makePrisma().businessRule, findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
    });
    const svc = new WorkflowService(prisma);
    await svc.deleteRule('org-1', 'r1', 'user-1');
    expect(prisma.businessRule.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});

// ─── toggleReport ─────────────────────────────────────────────────────────────
describe('WorkflowService.toggleReport', () => {
  it('throws NotFoundException for missing report', async () => {
    const svc = new WorkflowService(makePrisma());
    await expect(svc.toggleReport('org-1', 'rep-missing', 'user-1', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates report enabled flag', async () => {
    const prisma = makePrisma({
      scheduledReport: { ...makePrisma().scheduledReport, findFirst: jest.fn().mockResolvedValue({ id: 'rep-1' }) },
    });
    const svc = new WorkflowService(prisma);
    await svc.toggleReport('org-1', 'rep-1', 'user-1', false);
    expect(prisma.scheduledReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rep-1' }, data: { enabled: false } }),
    );
  });
});

// ─── deleteReport ─────────────────────────────────────────────────────────────
describe('WorkflowService.deleteReport', () => {
  it('throws NotFoundException for missing report', async () => {
    const svc = new WorkflowService(makePrisma());
    await expect(svc.deleteReport('org-1', 'rep-missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes existing report', async () => {
    const prisma = makePrisma({
      scheduledReport: { ...makePrisma().scheduledReport, findFirst: jest.fn().mockResolvedValue({ id: 'rep-1' }) },
    });
    const svc = new WorkflowService(prisma);
    await svc.deleteReport('org-1', 'rep-1', 'user-1');
    expect(prisma.scheduledReport.delete).toHaveBeenCalledWith({ where: { id: 'rep-1' } });
  });
});

// ─── publishEvent / listEvents ───────────────────────────────────────────────
describe('WorkflowService events', () => {
  it('publishEvent creates an event', async () => {
    const prisma = makePrisma();
    const svc = new WorkflowService(prisma);
    await svc.publishEvent('org-1', 'approval.created', { id: 'a1' });
    expect(prisma.enterpriseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org-1', type: 'approval.created' }) }),
    );
  });

  it('listEvents returns empty array', async () => {
    const svc = new WorkflowService(makePrisma());
    expect(await svc.listEvents('org-1')).toEqual([]);
  });
});
