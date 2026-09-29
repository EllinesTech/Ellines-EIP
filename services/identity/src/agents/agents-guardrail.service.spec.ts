/**
 * AgentsService — property tests for executeWithGuardrail and coordinateAgents
 *
 * Property 13 (Req 14.3, 14.4): Confidence threshold enforcement.
 *   executeWithGuardrail only calls the autonomous execution path when
 *   context.confidenceScore >= 0.90. Below that, it creates an ApprovalRequest
 *   instead. A ModelDecisionLog is always created.
 *
 * Property 14 (Req 14.6): Agent coordination.
 *   coordinateAgents returns a conflict when two agents target the same
 *   resource within a 60-second window.
 */

import { AgentsService } from './agents.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type AgentContext = Parameters<AgentsService['executeWithGuardrail']>[1];

function makeAgentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ag-1',
    organizationId: 'org-1',
    name: 'Test Agent',
    description: '',
    isActive: true,
    isPaused: false,
    requireApproval: false,
    confidenceThreshold: 0.75,
    action: { type: 'notify', params: {} },
    condition: {},
    executionCount: 0,
    successCount: 0,
    lastExecutedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    ...overrides,
  };
}

function makePrisma(activeAgents: ReturnType<typeof makeAgentRow>[] = []) {
  const decisionLogCreate = jest.fn().mockResolvedValue({ id: 'dl-1' });
  const approvalRequestCreate = jest.fn().mockResolvedValue({ id: 'apr-1' });
  const agentUpdate = jest.fn().mockResolvedValue({});
  const auditLogCreate = jest.fn().mockResolvedValue({});

  return {
    modelDecisionLog: { create: decisionLogCreate },
    approvalRequest: { create: approvalRequestCreate },
    ellineaAgent: {
      update: agentUpdate,
      findMany: jest.fn().mockResolvedValue(activeAgents),
    },
    agentAuditLog: {
      create: auditLogCreate,
      findMany: jest.fn().mockResolvedValue([]),
    },
    agentExecution: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'ex-1' }),
    },
    auditLog: {
      create: auditLogCreate,
    },
    _mocks: { decisionLogCreate, approvalRequestCreate, agentUpdate },
  } as unknown as PrismaService & { _mocks: Record<string, jest.Mock> };
}

function makeContext(confidenceScore: number, overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    confidenceScore,
    action: 'notify',
    resourceId: 'res-1',
    agentId: 'ag-1',
    ...overrides,
  } as AgentContext;
}

// ─── Property 13: Confidence threshold enforcement ────────────────────────────

describe('AgentsService.executeWithGuardrail — Property 13', () => {
  const THRESHOLD = 0.90;

  it('confidence < 0.90 → requiresApproval=true, executed=false', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    const agent = makeAgentRow();
    const result = await svc.executeWithGuardrail(agent as any, makeContext(0.89));
    expect(result.executed).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it('confidence = 0.89 (just below threshold) → deferred', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    const result = await svc.executeWithGuardrail(makeAgentRow() as any, makeContext(0.89));
    expect(result.executed).toBe(false);
  });

  it('confidence = 0.0 → deferred', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    const result = await svc.executeWithGuardrail(makeAgentRow() as any, makeContext(0.0));
    expect(result.executed).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it('confidence >= 0.90 → executed=true, requiresApproval=false', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    const result = await svc.executeWithGuardrail(makeAgentRow() as any, makeContext(0.90));
    expect(result.executed).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it('confidence = 1.0 → executed autonomously', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    const result = await svc.executeWithGuardrail(makeAgentRow() as any, makeContext(1.0));
    expect(result.executed).toBe(true);
  });

  it('confidence exactly at threshold (0.90) is autonomous', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    const result = await svc.executeWithGuardrail(makeAgentRow() as any, makeContext(THRESHOLD));
    expect(result.executed).toBe(true);
  });

  it('a ModelDecisionLog is always created regardless of confidence', async () => {
    for (const confidence of [0.0, 0.5, 0.89, 0.90, 1.0]) {
      const prisma = makePrisma();
      const svc = new AgentsService(prisma);
      await svc.executeWithGuardrail(makeAgentRow() as any, makeContext(confidence));
      const mocks = (prisma as any)._mocks;
      expect(mocks.decisionLogCreate).toHaveBeenCalled();
    }
  });

  it('deferred path creates an ApprovalRequest', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    await svc.executeWithGuardrail(makeAgentRow() as any, makeContext(0.5));
    const mocks = (prisma as any)._mocks;
    expect(mocks.approvalRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending' }),
      }),
    );
  });

  it('autonomous path increments executionCount on the agent', async () => {
    const prisma = makePrisma();
    const svc = new AgentsService(prisma);
    await svc.executeWithGuardrail(makeAgentRow() as any, makeContext(0.95));
    const mocks = (prisma as any)._mocks;
    expect(mocks.agentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionCount: expect.objectContaining({ increment: 1 }),
        }),
      }),
    );
  });
});

// ─── Property 14: Agent coordination — conflict detection ─────────────────────

describe('AgentsService.coordinateAgents — Property 14', () => {
  it('returns no conflict when no executions found in window', async () => {
    const prisma = makePrisma([]);
    const svc = new AgentsService(prisma);
    const result = await svc.coordinateAgents('org-1', 'res-1');
    expect(result.hasConflict).toBe(false);
  });

  it('returns no conflict when only one execution targets the resource', async () => {
    const prisma = makePrisma([]);
    // Only one execution — no conflict possible
    (prisma as any).agentExecution.findMany = jest.fn().mockResolvedValue([
      { id: 'ex-1', agentId: 'ag-1', organizationId: 'org-1', createdAt: new Date(), status: 'executed',
        triggerPayload: { resourceId: 'res-1' } },
    ]);
    const svc = new AgentsService(prisma);
    const result = await svc.coordinateAgents('org-1', 'res-1');
    expect(result.hasConflict).toBe(false);
  });

  it('returns conflict when two different agents have executions targeting same resource', async () => {
    const now = new Date();
    const agentList = [
      makeAgentRow({ id: 'ag-1', lastExecutedAt: new Date(now.getTime() - 50_000) }),
      makeAgentRow({ id: 'ag-2', lastExecutedAt: now }),
    ];
    const prisma = makePrisma(agentList as any);
    (prisma as any).agentExecution.findMany = jest.fn().mockResolvedValue([
      { id: 'ex-1', agentId: 'ag-1', organizationId: 'org-1', createdAt: new Date(now.getTime() - 50_000),
        status: 'executed', triggerPayload: { resourceId: 'res-1' } },
      { id: 'ex-2', agentId: 'ag-2', organizationId: 'org-1', createdAt: now,
        status: 'pending', triggerPayload: { resourceId: 'res-1' } },
    ]);
    const svc = new AgentsService(prisma);
    const result = await svc.coordinateAgents('org-1', 'res-1');
    expect(result.hasConflict).toBe(true);
  });

  it('blockedAgentId is set when conflict is detected', async () => {
    const now = new Date();
    const agentList = [
      makeAgentRow({ id: 'ag-owner', lastExecutedAt: new Date(now.getTime() - 50_000) }),
      makeAgentRow({ id: 'ag-blocked', lastExecutedAt: now }),
    ];
    const prisma = makePrisma(agentList as any);
    (prisma as any).agentExecution.findMany = jest.fn().mockResolvedValue([
      { id: 'ex-1', agentId: 'ag-owner', organizationId: 'org-1', createdAt: new Date(now.getTime() - 50_000),
        status: 'executed', triggerPayload: { resourceId: 'res-1' } },
      { id: 'ex-2', agentId: 'ag-blocked', organizationId: 'org-1', createdAt: now,
        status: 'pending', triggerPayload: { resourceId: 'res-1' } },
    ]);
    const svc = new AgentsService(prisma);
    const result = await svc.coordinateAgents('org-1', 'res-1');
    if (result.hasConflict) {
      expect(result.blockedAgentId).toBe('ag-blocked');
      expect(result.conflictingAgentId).toBe('ag-owner');
    }
  });
});
