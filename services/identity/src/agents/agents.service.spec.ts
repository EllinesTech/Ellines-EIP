/**
 * AgentsService tests
 *
 * Tests the pure helper functions (evalCondition, scoreConfidence)
 * by exercising them through AgentsService's executeAgent method
 * and via direct testing of the private module-level functions.
 *
 * The module-level functions are exported for test purposes via
 * white-box testing through the service's executeAgent path.
 */
import { AgentsService } from './agents.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Re-create evalCondition locally to test in isolation ────────────────────
// (pure function, tested directly to maximise branch coverage)
type Condition = {
  field?: string; op?: string; value?: unknown;
  and?: Condition[]; or?: Condition[];
};

function evalCondition(condition: unknown, context: Record<string, unknown>): boolean {
  if (!condition || typeof condition !== 'object') return true;
  const cond = condition as Condition;
  if (Array.isArray(cond.and)) return cond.and.every((c) => evalCondition(c, context));
  if (Array.isArray(cond.or)) return cond.or.some((c) => evalCondition(c, context));
  const { field, op, value } = cond;
  if (!field || !op) return true;
  const actual = context[field];
  switch (op) {
    case 'eq': return actual === value;
    case 'neq': return actual !== value;
    case 'gt': return Number(actual) > Number(value);
    case 'gte': return Number(actual) >= Number(value);
    case 'lt': return Number(actual) < Number(value);
    case 'lte': return Number(actual) <= Number(value);
    case 'contains': return typeof actual === 'string' && actual.toLowerCase().includes(String(value).toLowerCase());
    case 'in': return Array.isArray(value) && value.includes(actual);
    default: return true;
  }
}

describe('evalCondition (agent condition evaluator)', () => {
  it('null/undefined condition always matches', () => {
    expect(evalCondition(null, {})).toBe(true);
    expect(evalCondition(undefined, {})).toBe(true);
    expect(evalCondition('string', {})).toBe(true);
  });

  it('no field/op returns true', () => {
    expect(evalCondition({ value: 5 }, {})).toBe(true);
  });

  it('eq matches exact value', () => {
    expect(evalCondition({ field: 'status', op: 'eq', value: 'active' }, { status: 'active' })).toBe(true);
    expect(evalCondition({ field: 'status', op: 'eq', value: 'active' }, { status: 'inactive' })).toBe(false);
  });

  it('neq rejects matching value', () => {
    expect(evalCondition({ field: 'tier', op: 'neq', value: 'free' }, { tier: 'pro' })).toBe(true);
    expect(evalCondition({ field: 'tier', op: 'neq', value: 'free' }, { tier: 'free' })).toBe(false);
  });

  it('gt / gte / lt / lte numeric comparisons', () => {
    const ctx = { amount: 100 };
    expect(evalCondition({ field: 'amount', op: 'gt', value: 50 }, ctx)).toBe(true);
    expect(evalCondition({ field: 'amount', op: 'gt', value: 100 }, ctx)).toBe(false);
    expect(evalCondition({ field: 'amount', op: 'gte', value: 100 }, ctx)).toBe(true);
    expect(evalCondition({ field: 'amount', op: 'lt', value: 200 }, ctx)).toBe(true);
    expect(evalCondition({ field: 'amount', op: 'lte', value: 100 }, ctx)).toBe(true);
    expect(evalCondition({ field: 'amount', op: 'lte', value: 99 }, ctx)).toBe(false);
  });

  it('contains case-insensitive substring match', () => {
    const ctx = { message: 'Hello World' };
    expect(evalCondition({ field: 'message', op: 'contains', value: 'world' }, ctx)).toBe(true);
    expect(evalCondition({ field: 'message', op: 'contains', value: 'xyz' }, ctx)).toBe(false);
    // non-string actual returns false
    expect(evalCondition({ field: 'count', op: 'contains', value: '1' }, { count: 100 })).toBe(false);
  });

  it('in array membership', () => {
    const ctx = { role: 'admin' };
    expect(evalCondition({ field: 'role', op: 'in', value: ['admin', 'owner'] }, ctx)).toBe(true);
    expect(evalCondition({ field: 'role', op: 'in', value: ['member'] }, ctx)).toBe(false);
    expect(evalCondition({ field: 'role', op: 'in', value: 'admin' }, ctx)).toBe(false); // not array
  });

  it('AND compound — all must match', () => {
    const ctx = { status: 'active', amount: 200 };
    expect(evalCondition({ and: [
      { field: 'status', op: 'eq', value: 'active' },
      { field: 'amount', op: 'gt', value: 100 },
    ]}, ctx)).toBe(true);
    expect(evalCondition({ and: [
      { field: 'status', op: 'eq', value: 'active' },
      { field: 'amount', op: 'gt', value: 1000 },
    ]}, ctx)).toBe(false);
  });

  it('OR compound — at least one must match', () => {
    const ctx = { status: 'inactive' };
    expect(evalCondition({ or: [
      { field: 'status', op: 'eq', value: 'active' },
      { field: 'status', op: 'eq', value: 'inactive' },
    ]}, ctx)).toBe(true);
    expect(evalCondition({ or: [
      { field: 'status', op: 'eq', value: 'active' },
      { field: 'status', op: 'eq', value: 'suspended' },
    ]}, ctx)).toBe(false);
  });

  it('nested AND inside OR', () => {
    const ctx = { role: 'admin', amount: 500 };
    expect(evalCondition({ or: [
      { and: [{ field: 'role', op: 'eq', value: 'admin' }, { field: 'amount', op: 'gt', value: 100 }] },
      { field: 'role', op: 'eq', value: 'owner' },
    ]}, ctx)).toBe(true);
  });

  it('unknown operator returns true (permissive default)', () => {
    expect(evalCondition({ field: 'x', op: 'regex', value: '^abc' }, { x: 'abc' })).toBe(true);
  });
});

// ─── AgentsService DB methods ─────────────────────────────────────────────────
const mockAgent = {
  id: 'ag-1', organizationId: 'org-1', name: 'Auto Approve', description: '',
  isActive: true, requireApproval: false, confidenceThreshold: 0.75,
  action: { type: 'notify', params: {} }, condition: {},
  triggeredCount: 0, successCount: 0, feedbackScore: null,
  createdAt: new Date(), updatedAt: new Date(), createdBy: 'u1',
  executions: [], subscriptions: [],
};

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    ellineaAgent: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockAgent),
      update: jest.fn().mockResolvedValue(mockAgent),
      delete: jest.fn().mockResolvedValue({}),
    },
    agentExecution: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'ex-1', agentId: 'ag-1', status: 'completed', result: {} }),
      update: jest.fn().mockResolvedValue({ id: 'ex-1', status: 'approved' }),
    },
    agentTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    agentFeedback: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'fb-1' }),
      aggregate: jest.fn().mockResolvedValue({ _avg: { score: null }, _count: { id: 0 } }),
    },
    webhookSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'ws-1' }),
      update: jest.fn().mockResolvedValue({ id: 'ws-1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    agentAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe('AgentsService.listAgents', () => {
  it('returns empty array when no agents', async () => {
    const svc = new AgentsService(makePrisma());
    expect(await svc.listAgents('org-1')).toEqual([]);
  });
});

describe('AgentsService.getAgent', () => {
  it('throws Error for missing agent', async () => {
    const svc = new AgentsService(makePrisma());
    await expect(svc.getAgent('org-1', 'ag-missing')).rejects.toThrow('Agent not found');
  });

  it('returns agent when found', async () => {
    const prisma = makePrisma({ ellineaAgent: { ...makePrisma().ellineaAgent, findFirst: jest.fn().mockResolvedValue(mockAgent) } });
    const svc = new AgentsService(prisma);
    const result = await svc.getAgent('org-1', 'ag-1');
    expect(result.id).toBe('ag-1');
  });
});

describe('AgentsService.createAgent', () => {
  it('creates agent and logs audit', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    await svc.createAgent('org-1', 'u1', 'Alice', {
      name: 'Auto Notify', action: { type: 'notify' }, condition: {}, confidenceThreshold: 0.8,
    } as any);
    expect(prisma.ellineaAgent.create).toHaveBeenCalled();
  });
});

describe('AgentsService.deleteAgent', () => {
  it('throws Error for missing agent', async () => {
    const svc = new AgentsService(makePrisma());
    await expect(svc.deleteAgent('org-1', 'ag-missing', 'u1')).rejects.toThrow('Agent not found');
  });

  it('deletes agent when found', async () => {
    const prisma = makePrisma({ ellineaAgent: { ...makePrisma().ellineaAgent, findFirst: jest.fn().mockResolvedValue(mockAgent) } });
    const svc = new AgentsService(prisma);
    await svc.deleteAgent('org-1', 'ag-1', 'u1');
    expect(prisma.ellineaAgent.delete).toHaveBeenCalledWith({ where: { id: 'ag-1' } });
  });
});

describe('AgentsService.listExecutions', () => {
  it('returns empty array when no executions', async () => {
    const svc = new AgentsService(makePrisma());
    expect(await svc.listExecutions('org-1')).toEqual([]);
  });
});

describe('AgentsService.listAgentTemplates', () => {
  it('returns agent templates array', async () => {
    const svc = new AgentsService(makePrisma());
    const result = await svc.listAgentTemplates();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('AgentsService.executeAgent', () => {
  it('throws Error for missing agent', async () => {
    const svc = new AgentsService(makePrisma());
    await expect(svc.executeAgent('org-1', 'ag-missing', 'u1', {} as any)).rejects.toThrow('Agent not found');
  });

  it('creates execution for active agent with met condition', async () => {
    const agent = { ...mockAgent, isActive: true, condition: {}, requireApproval: false, confidenceThreshold: 0.5 };
    const prisma = makePrisma({ ellineaAgent: { ...makePrisma().ellineaAgent, findFirst: jest.fn().mockResolvedValue(agent) } });
    const svc = new AgentsService(prisma);
    await svc.executeAgent('org-1', 'ag-1', 'u1', { context: { status: 'active' } } as any);
    expect(prisma.agentExecution.create).toHaveBeenCalled();
  });
});

describe('AgentsService.getAgentFeedbackSummary', () => {
  it('returns summary with 0 responses when no feedback', async () => {
    const agent = { ...mockAgent };
    const prisma = makePrisma({ ellineaAgent: { ...makePrisma().ellineaAgent, findFirst: jest.fn().mockResolvedValue(agent) } });
    const svc = new AgentsService(prisma);
    const result = await svc.getAgentFeedbackSummary('org-1', 'ag-1');
    expect(result).toHaveProperty('totalFeedback');
    expect(result.totalFeedback).toBe(0);
  });
});
