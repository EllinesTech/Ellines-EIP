import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RuleService } from './rule.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Pure evaluateCondition ───────────────────────────────────────────────────
describe('RuleService.evaluateCondition (pure)', () => {
  const svc = new RuleService({} as PrismaService);

  it('empty condition always returns true', () => {
    expect(svc.evaluateCondition({}, {})).toBe(true);
    expect(svc.evaluateCondition(null as any, {})).toBe(true);
  });

  it('missing field or op returns true', () => {
    expect(svc.evaluateCondition({ value: 5 } as any, {})).toBe(true);
    expect(svc.evaluateCondition({ field: 'x' } as any, {})).toBe(true);
  });

  describe('eq', () => {
    it('matches equal string', () => {
      expect(svc.evaluateCondition({ field: 'status', op: 'eq', value: 'active' }, { status: 'active' })).toBe(true);
    });
    it('rejects non-equal', () => {
      expect(svc.evaluateCondition({ field: 'status', op: 'eq', value: 'active' }, { status: 'inactive' })).toBe(false);
    });
    it('works with numbers', () => {
      expect(svc.evaluateCondition({ field: 'count', op: 'eq', value: 5 }, { count: 5 })).toBe(true);
      expect(svc.evaluateCondition({ field: 'count', op: 'eq', value: 5 }, { count: 6 })).toBe(false);
    });
  });

  describe('neq', () => {
    it('passes when values differ', () => {
      expect(svc.evaluateCondition({ field: 'role', op: 'neq', value: 'member' }, { role: 'owner' })).toBe(true);
    });
    it('fails when values match', () => {
      expect(svc.evaluateCondition({ field: 'role', op: 'neq', value: 'owner' }, { role: 'owner' })).toBe(false);
    });
  });

  describe('gt / gte / lt / lte', () => {
    const ctx = { amount: 100 };
    it('gt', () => {
      expect(svc.evaluateCondition({ field: 'amount', op: 'gt', value: 99 }, ctx)).toBe(true);
      expect(svc.evaluateCondition({ field: 'amount', op: 'gt', value: 100 }, ctx)).toBe(false);
    });
    it('gte', () => {
      expect(svc.evaluateCondition({ field: 'amount', op: 'gte', value: 100 }, ctx)).toBe(true);
      expect(svc.evaluateCondition({ field: 'amount', op: 'gte', value: 101 }, ctx)).toBe(false);
    });
    it('lt', () => {
      expect(svc.evaluateCondition({ field: 'amount', op: 'lt', value: 101 }, ctx)).toBe(true);
      expect(svc.evaluateCondition({ field: 'amount', op: 'lt', value: 100 }, ctx)).toBe(false);
    });
    it('lte', () => {
      expect(svc.evaluateCondition({ field: 'amount', op: 'lte', value: 100 }, ctx)).toBe(true);
      expect(svc.evaluateCondition({ field: 'amount', op: 'lte', value: 99 }, ctx)).toBe(false);
    });
  });

  describe('in / nin', () => {
    const ctx = { tier: 'pro' };
    it('in: passes when value in array', () => {
      expect(svc.evaluateCondition({ field: 'tier', op: 'in', value: ['free', 'pro'] }, ctx)).toBe(true);
    });
    it('in: fails when value not in array', () => {
      expect(svc.evaluateCondition({ field: 'tier', op: 'in', value: ['free'] }, ctx)).toBe(false);
    });
    it('in: false when value is not an array', () => {
      expect(svc.evaluateCondition({ field: 'tier', op: 'in', value: 'pro' }, ctx)).toBe(false);
    });
    it('nin: passes when value not in array', () => {
      expect(svc.evaluateCondition({ field: 'tier', op: 'nin', value: ['enterprise'] }, ctx)).toBe(true);
    });
    it('nin: fails when value is in array', () => {
      expect(svc.evaluateCondition({ field: 'tier', op: 'nin', value: ['pro'] }, ctx)).toBe(false);
    });
  });

  describe('nested field paths', () => {
    it('resolves deep dot-notation paths', () => {
      const ctx = { approval: { status: 'pending', amount: 500 } };
      expect(svc.evaluateCondition({ field: 'approval.status', op: 'eq', value: 'pending' }, ctx)).toBe(true);
      expect(svc.evaluateCondition({ field: 'approval.amount', op: 'gt', value: 100 }, ctx)).toBe(true);
      expect(svc.evaluateCondition({ field: 'approval.amount', op: 'lt', value: 100 }, ctx)).toBe(false);
    });

    it('returns undefined for missing nested path (comparison fails gracefully)', () => {
      const ctx = { user: { role: 'owner' } };
      expect(svc.evaluateCondition({ field: 'user.missing.deep', op: 'eq', value: 'x' }, ctx)).toBe(false);
    });
  });

  it('unknown operator returns false', () => {
    expect(svc.evaluateCondition({ field: 'x', op: 'startswith', value: 'a' }, { x: 'abc' })).toBe(false);
  });
});

// ─── RuleService DB methods ───────────────────────────────────────────────────
function makePrisma(overrides: Record<string, any> = {}) {
  return {
    workflowRule: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'r1', name: 'test rule', autonomyLevel: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'r1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    ruleExecution: {
      create: jest.fn().mockResolvedValue({ id: 'e1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'e1', status: 'approved' }),
    },
    ruleSchedule: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 's1', cronExpression: '0 * * * *' }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe('RuleService.createRule', () => {
  it('creates a rule with valid autonomy level', async () => {
    const prisma = makePrisma();
    const svc = new RuleService(prisma);
    await svc.createRule('org-1', { name: 'Test', autonomyLevel: 1, trigger: 'approval.created', condition: {}, action: { type: 'notify' } }, 'user-1');
    expect(prisma.workflowRule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Test', autonomyLevel: 1 }) }),
    );
  });

  it('throws BadRequestException for invalid autonomy level', async () => {
    const svc = new RuleService(makePrisma());
    await expect(
      svc.createRule('org-1', { name: 'Bad', autonomyLevel: 5 as any, trigger: 't', condition: {}, action: {} }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RuleService.getRule', () => {
  it('returns rule when found', async () => {
    const rule = { id: 'r1', organizationId: 'org-1', name: 'Rule 1' };
    const prisma = makePrisma({ workflowRule: { findFirst: jest.fn().mockResolvedValue(rule), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() } });
    const svc = new RuleService(prisma);
    const result = await svc.getRule('r1', 'org-1');
    expect(result).toEqual(rule);
  });

  it('throws NotFoundException when rule not found', async () => {
    const svc = new RuleService(makePrisma());
    await expect(svc.getRule('r-missing', 'org-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RuleService.executeRule', () => {
  it('returns false when rule not found', async () => {
    const svc = new RuleService(makePrisma());
    const result = await svc.executeRule('r-missing', {});
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  it('returns false when rule is inactive', async () => {
    const prisma = makePrisma({ workflowRule: { ...makePrisma().workflowRule, findUnique: jest.fn().mockResolvedValue({ id: 'r1', isActive: false, condition: {}, action: { type: 'notify' }, autonomyLevel: 1 }) } });
    const svc = new RuleService(prisma);
    const result = await svc.executeRule('r1', {});
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not active/i);
  });

  it('returns false when condition not met', async () => {
    const prisma = makePrisma({ workflowRule: { ...makePrisma().workflowRule, findUnique: jest.fn().mockResolvedValue({ id: 'r1', isActive: true, condition: { field: 'amount', op: 'gt', value: 1000 }, action: { type: 'notify' }, autonomyLevel: 1 }) } });
    const svc = new RuleService(prisma);
    const result = await svc.executeRule('r1', { amount: 50 });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/condition not met/i);
  });

  it('executes when condition is met (autonomy level 1)', async () => {
    const prisma = makePrisma({ workflowRule: { ...makePrisma().workflowRule, findUnique: jest.fn().mockResolvedValue({ id: 'r1', isActive: true, condition: { field: 'amount', op: 'gt', value: 100 }, action: { type: 'notify' }, autonomyLevel: 1 }) } });
    const svc = new RuleService(prisma);
    const result = await svc.executeRule('r1', { amount: 500 });
    expect(result.success).toBe(true);
    expect(prisma.ruleExecution.create).toHaveBeenCalled();
  });

  it('sets status to pending for autonomy level 2', async () => {
    const prisma = makePrisma({ workflowRule: { ...makePrisma().workflowRule, findUnique: jest.fn().mockResolvedValue({ id: 'r1', isActive: true, condition: {}, action: { type: 'approve' }, autonomyLevel: 2 }) } });
    const svc = new RuleService(prisma);
    await svc.executeRule('r1', {});
    expect(prisma.ruleExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
    );
  });
});

describe('RuleService.addSchedule', () => {
  it('throws BadRequestException for non-level-3 rule', async () => {
    const rule = { id: 'r1', autonomyLevel: 1, organizationId: 'org-1' };
    const prisma = makePrisma({ workflowRule: { ...makePrisma().workflowRule, findFirst: jest.fn().mockResolvedValue(rule) } });
    const svc = new RuleService(prisma);
    await expect(svc.addSchedule('r1', 'org-1', '0 * * * *')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates schedule for level 3 rule', async () => {
    const rule = { id: 'r1', autonomyLevel: 3, organizationId: 'org-1' };
    const prisma = makePrisma({ workflowRule: { ...makePrisma().workflowRule, findFirst: jest.fn().mockResolvedValue(rule) } });
    const svc = new RuleService(prisma);
    await svc.addSchedule('r1', 'org-1', '0 8 * * *');
    expect(prisma.ruleSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ruleId: 'r1', cronExpression: '0 8 * * *' }) }),
    );
  });
});

describe('RuleService.approveExecution / rejectExecution', () => {
  it('throws NotFoundException for missing execution on approve', async () => {
    const svc = new RuleService(makePrisma());
    await expect(svc.approveExecution('e-missing', 'org-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates status to approved', async () => {
    const exec = { id: 'e1', status: 'pending' };
    const prisma = makePrisma({ ruleExecution: { ...makePrisma().ruleExecution, findFirst: jest.fn().mockResolvedValue(exec) } });
    const svc = new RuleService(prisma);
    await svc.approveExecution('e1', 'org-1', 'user-1');
    expect(prisma.ruleExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
    );
  });

  it('updates status to rejected', async () => {
    const exec = { id: 'e1', status: 'pending' };
    const prisma = makePrisma({ ruleExecution: { ...makePrisma().ruleExecution, findFirst: jest.fn().mockResolvedValue(exec) } });
    const svc = new RuleService(prisma);
    await svc.rejectExecution('e1', 'org-1', 'user-1');
    expect(prisma.ruleExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'rejected' }) }),
    );
  });
});
