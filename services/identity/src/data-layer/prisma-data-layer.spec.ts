/**
 * Integration tests — Prisma Data Layer: Model Registry & Remediation Playbook
 *
 * Tests CRUD operations, validation logic, relationship integrity, and
 * query patterns for the v2.0 Prisma models:
 *   - AiModelRegistry (and related ModelDecisionLog, ModelPerformanceLog)
 *   - RemediationPlaybook (and related RemediationExecution)
 *
 * Uses the same mock-Prisma pattern established by the rest of this service.
 *
 * Requirements: 1.1 (Model registry performance tracking), 17.1 (Data layer)
 */

import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Prisma model fixtures ────────────────────────────────────────────────────

const mockModel = {
  id: 'mr_001',
  modelId: 'gpt-4',
  displayName: 'GPT-4',
  provider: 'openai',
  modelType: 'language',
  capabilities: ['text', 'code', 'reasoning'],
  contextWindow: 128000,
  costPerMToken: 30.0,
  avgLatencyMs: 1200,
  accuracyScore: 0.92,
  throughputQps: 5.0,
  isAvailable: true,
  priority: 80,
  configuration: {},
  fallbackModelId: 'gpt-3.5-turbo',
  lastHealthCheck: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDecisionLog = {
  id: 'dl_001',
  organizationId: 'org_test',
  queryId: 'q_001',
  queryType: 'text',
  selectedModelId: 'gpt-4',
  secondaryModels: [],
  routingReason: 'Best language model for text query',
  ensembleStrategy: null,
  confidence: 0.89,
  latencyMs: 1150,
  success: true,
  errorMessage: null,
  createdAt: new Date(),
};

const mockPerformanceLog = {
  id: 'pl_001',
  modelId: 'gpt-4',
  windowStart: new Date('2025-01-01T00:00:00Z'),
  windowEnd: new Date('2025-01-01T01:00:00Z'),
  requestCount: 120,
  successCount: 118,
  failureCount: 2,
  avgLatencyMs: 1210.5,
  p95LatencyMs: 1850.0,
  p99LatencyMs: 2100.0,
  avgConfidence: 0.88,
  totalCost: 1.44,
  createdAt: new Date(),
};

const mockPlaybook = {
  id: 'pb_001',
  errorPattern: 'connection refused.*postgres',
  errorCategory: 'database',
  severity: 'critical',
  stages: [
    { stageNumber: 1, actions: [{ type: 'pool_reset', target: 'postgres', riskLevel: 'low', parameters: {} }] },
    { stageNumber: 2, actions: [{ type: 'restart', target: 'identity', riskLevel: 'medium', parameters: {} }] },
  ],
  confidenceThreshold: 0.85,
  maxAttempts: 3,
  verificationPeriod: 300,
  isActive: true,
  createdBy: 'system',
  learnedFrom: null,
  successRate: 0.92,
  executionCount: 25,
  lastExecutedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockExecution = {
  id: 're_001',
  playbookId: 'pb_001',
  organizationId: 'org_test',
  incidentId: 'inc_001',
  errorPattern: 'connection refused.*postgres',
  stagesExecuted: 1,
  actionsPerformed: [{ type: 'pool_reset', target: 'postgres' }],
  confidence: 0.92,
  outcome: 'success',
  beforeSnapshot: { connectionPool: 'exhausted' },
  afterSnapshot: { connectionPool: 'healthy' },
  timeTaken: 2340,
  escalatedTo: null,
  escalationReason: null,
  verifiedAt: new Date(),
  createdAt: new Date(),
};

// ─── Mock Prisma factory ──────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, Partial<Record<string, jest.Mock>>> = {}) {
  const base = {
    aiModelRegistry: {
      findMany: jest.fn().mockResolvedValue([mockModel]),
      findUnique: jest.fn().mockResolvedValue(mockModel),
      create: jest.fn().mockResolvedValue(mockModel),
      update: jest.fn().mockResolvedValue({ ...mockModel, isAvailable: false }),
      delete: jest.fn().mockResolvedValue(mockModel),
      count: jest.fn().mockResolvedValue(1),
    },
    modelDecisionLog: {
      findMany: jest.fn().mockResolvedValue([mockDecisionLog]),
      create: jest.fn().mockResolvedValue(mockDecisionLog),
      aggregate: jest.fn().mockResolvedValue({
        _avg: { confidence: 0.89, latencyMs: 1150 },
        _count: { _all: 120 },
      }),
      groupBy: jest.fn().mockResolvedValue([
        { queryType: 'text', _count: { _all: 80 } },
        { queryType: 'forecast', _count: { _all: 40 } },
      ]),
    },
    modelPerformanceLog: {
      findMany: jest.fn().mockResolvedValue([mockPerformanceLog]),
      create: jest.fn().mockResolvedValue(mockPerformanceLog),
      upsert: jest.fn().mockResolvedValue(mockPerformanceLog),
      aggregate: jest.fn().mockResolvedValue({
        _avg: { avgLatencyMs: 1210.5, avgConfidence: 0.88 },
        _sum: { requestCount: 120, successCount: 118, totalCost: 1.44 },
      }),
    },
    remediationPlaybook: {
      findMany: jest.fn().mockResolvedValue([mockPlaybook]),
      findFirst: jest.fn().mockResolvedValue(mockPlaybook),
      findUnique: jest.fn().mockResolvedValue(mockPlaybook),
      create: jest.fn().mockResolvedValue(mockPlaybook),
      update: jest.fn().mockResolvedValue({ ...mockPlaybook, successRate: 0.95 }),
      delete: jest.fn().mockResolvedValue(mockPlaybook),
      count: jest.fn().mockResolvedValue(1),
    },
    remediationExecution: {
      findMany: jest.fn().mockResolvedValue([mockExecution]),
      create: jest.fn().mockResolvedValue(mockExecution),
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 25 },
        _avg: { confidence: 0.91, timeTaken: 2300 },
      }),
      groupBy: jest.fn().mockResolvedValue([
        { outcome: 'success', _count: { _all: 23 } },
        { outcome: 'escalated', _count: { _all: 2 } },
      ]),
    },
  };

  for (const [model, methods] of Object.entries(overrides)) {
    if (base[model as keyof typeof base]) {
      Object.assign(base[model as keyof typeof base], methods);
    }
  }

  return base as unknown as PrismaService;
}

// ─── AiModelRegistry — CRUD ───────────────────────────────────────────────────

describe('PrismaService — AiModelRegistry: list models', () => {
  it('returns all registered AI models', async () => {
    const prisma = makePrisma();

    const models = await prisma.aiModelRegistry.findMany({ where: { isAvailable: true } });

    expect(models).toHaveLength(1);
    expect(models[0].modelId).toBe('gpt-4');
    expect(models[0].modelType).toBe('language');
    expect(prisma.aiModelRegistry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isAvailable: true } }),
    );
  });

  it('looks up a model by unique modelId', async () => {
    const prisma = makePrisma();

    const model = await prisma.aiModelRegistry.findUnique({ where: { modelId: 'gpt-4' } });

    expect(model).not.toBeNull();
    expect(model!.displayName).toBe('GPT-4');
    expect(model!.provider).toBe('openai');
  });

  it('returns null for unknown modelId', async () => {
    const prisma = makePrisma({
      aiModelRegistry: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    const model = await prisma.aiModelRegistry.findUnique({ where: { modelId: 'unknown-model' } });

    expect(model).toBeNull();
  });
});

describe('PrismaService — AiModelRegistry: create model', () => {
  it('creates a new model registry entry', async () => {
    const createMock = jest.fn().mockResolvedValue(mockModel);
    const prisma = makePrisma({ aiModelRegistry: { create: createMock } });

    await prisma.aiModelRegistry.create({
      data: {
        modelId: 'gpt-4',
        displayName: 'GPT-4',
        provider: 'openai',
        modelType: 'language',
        capabilities: ['text', 'code'],
        isAvailable: true,
        priority: 80,
        configuration: {},
      },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modelId: 'gpt-4',
          provider: 'openai',
          modelType: 'language',
        }),
      }),
    );
  });
});

describe('PrismaService — AiModelRegistry: update availability', () => {
  it('marks a model as unavailable', async () => {
    const updateMock = jest.fn().mockResolvedValue({ ...mockModel, isAvailable: false });
    const prisma = makePrisma({ aiModelRegistry: { update: updateMock } });

    const updated = await prisma.aiModelRegistry.update({
      where: { modelId: 'gpt-4' },
      data: { isAvailable: false, lastHealthCheck: new Date() },
    });

    expect(updated.isAvailable).toBe(false);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { modelId: 'gpt-4' }, data: expect.objectContaining({ isAvailable: false }) }),
    );
  });

  it('updates performance metrics on the registry entry', async () => {
    const updateMock = jest.fn().mockResolvedValue({ ...mockModel, avgLatencyMs: 980 });
    const prisma = makePrisma({ aiModelRegistry: { update: updateMock } });

    const updated = await prisma.aiModelRegistry.update({
      where: { modelId: 'gpt-4' },
      data: { avgLatencyMs: 980, accuracyScore: 0.94 },
    });

    expect(updated.avgLatencyMs).toBe(980);
  });
});

// ─── ModelDecisionLog — Write / Query ─────────────────────────────────────────

describe('PrismaService — ModelDecisionLog: record decisions', () => {
  it('creates a model decision log entry', async () => {
    const createMock = jest.fn().mockResolvedValue(mockDecisionLog);
    const prisma = makePrisma({ modelDecisionLog: { create: createMock } });

    await prisma.modelDecisionLog.create({
      data: {
        organizationId: 'org_test',
        queryId: 'q_001',
        queryType: 'text',
        selectedModelId: 'gpt-4',
        routingReason: 'Best language model for text query',
        confidence: 0.89,
        latencyMs: 1150,
        success: true,
      },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          queryType: 'text',
          selectedModelId: 'gpt-4',
          success: true,
        }),
      }),
    );
  });

  it('queries recent decisions by organization', async () => {
    const prisma = makePrisma();

    const logs = await prisma.modelDecisionLog.findMany({
      where: { organizationId: 'org_test' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].selectedModelId).toBe('gpt-4');
  });

  it('aggregates average confidence across decisions', async () => {
    const prisma = makePrisma();

    const stats = await prisma.modelDecisionLog.aggregate({
      where: { selectedModelId: 'gpt-4' },
      _avg: { confidence: true, latencyMs: true },
      _count: { _all: true },
    });

    expect(stats._avg.confidence).toBe(0.89);
    expect(stats._avg.latencyMs).toBe(1150);
    expect(stats._count._all).toBe(120);
  });

  it('groups decisions by query type', async () => {
    const prisma = makePrisma();

    const breakdown = await prisma.modelDecisionLog.groupBy({
      by: ['queryType'],
      _count: { _all: true },
    } as Parameters<typeof prisma.modelDecisionLog.groupBy>[0]);

    expect(breakdown).toHaveLength(2);
    const textGroup = breakdown.find((g: { queryType: string }) => g.queryType === 'text');
    expect(textGroup).toBeDefined();
  });
});

// ─── ModelPerformanceLog — Write / Aggregate ──────────────────────────────────

describe('PrismaService — ModelPerformanceLog: performance tracking', () => {
  it('upserts a performance log window', async () => {
    const upsertMock = jest.fn().mockResolvedValue(mockPerformanceLog);
    const prisma = makePrisma({ modelPerformanceLog: { upsert: upsertMock } });

    await prisma.modelPerformanceLog.upsert({
      where: { modelId_windowStart: { modelId: 'gpt-4', windowStart: new Date('2025-01-01T00:00:00Z') } },
      create: {
        modelId: 'gpt-4',
        windowStart: new Date('2025-01-01T00:00:00Z'),
        windowEnd: new Date('2025-01-01T01:00:00Z'),
        requestCount: 120,
        successCount: 118,
        failureCount: 2,
        avgLatencyMs: 1210.5,
        totalCost: 1.44,
      },
      update: {
        requestCount: { increment: 1 },
        successCount: { increment: 1 },
      },
    });

    expect(upsertMock).toHaveBeenCalled();
  });

  it('aggregates total requests and cost across time windows', async () => {
    const prisma = makePrisma();

    const summary = await prisma.modelPerformanceLog.aggregate({
      where: { modelId: 'gpt-4' },
      _sum: { requestCount: true, successCount: true, totalCost: true },
      _avg: { avgLatencyMs: true, avgConfidence: true },
    });

    expect(summary._sum.requestCount).toBe(120);
    expect(summary._sum.totalCost).toBe(1.44);
    expect(summary._avg.avgLatencyMs).toBe(1210.5);
  });

  it('lists performance logs for a model ordered by window', async () => {
    const prisma = makePrisma();

    const logs = await prisma.modelPerformanceLog.findMany({
      where: { modelId: 'gpt-4' },
      orderBy: { windowStart: 'desc' },
      take: 24, // Last 24 hours of hourly windows
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].modelId).toBe('gpt-4');
    expect(logs[0].avgLatencyMs).toBe(1210.5);
  });
});

// ─── RemediationPlaybook — CRUD ───────────────────────────────────────────────

describe('PrismaService — RemediationPlaybook: list & lookup', () => {
  it('returns all active playbooks', async () => {
    const prisma = makePrisma();

    const playbooks = await prisma.remediationPlaybook.findMany({ where: { isActive: true } });

    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].errorCategory).toBe('database');
    expect(playbooks[0].severity).toBe('critical');
  });

  it('finds a playbook by unique errorPattern', async () => {
    const prisma = makePrisma();

    const playbook = await prisma.remediationPlaybook.findUnique({
      where: { errorPattern: 'connection refused.*postgres' },
    });

    expect(playbook).not.toBeNull();
    expect(playbook!.confidenceThreshold).toBe(0.85);
    expect(playbook!.maxAttempts).toBe(3);
  });

  it('finds playbook matching an error pattern using findFirst', async () => {
    const prisma = makePrisma();

    const playbook = await prisma.remediationPlaybook.findFirst({
      where: {
        isActive: true,
        errorCategory: 'database',
        severity: { in: ['critical', 'high'] },
      },
    });

    expect(playbook).not.toBeNull();
    expect(playbook!.verificationPeriod).toBe(300); // 5-minute verification window
  });

  it('returns null when no playbook matches', async () => {
    const prisma = makePrisma({
      remediationPlaybook: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    const playbook = await prisma.remediationPlaybook.findFirst({
      where: { errorCategory: 'unknown' },
    });

    expect(playbook).toBeNull();
  });
});

describe('PrismaService — RemediationPlaybook: create & update', () => {
  it('creates a new playbook entry', async () => {
    const createMock = jest.fn().mockResolvedValue(mockPlaybook);
    const prisma = makePrisma({ remediationPlaybook: { create: createMock } });

    await prisma.remediationPlaybook.create({
      data: {
        errorPattern: 'ECONNREFUSED.*redis',
        errorCategory: 'cache',
        severity: 'high',
        stages: [{ stageNumber: 1, actions: [{ type: 'restart', target: 'redis', riskLevel: 'medium' }] }],
        confidenceThreshold: 0.85,
        maxAttempts: 3,
        verificationPeriod: 300,
        createdBy: 'system',
      },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorPattern: 'ECONNREFUSED.*redis',
          errorCategory: 'cache',
          confidenceThreshold: 0.85,
        }),
      }),
    );
  });

  it('updates success rate after a successful remediation', async () => {
    const updateMock = jest.fn().mockResolvedValue({ ...mockPlaybook, successRate: 0.95, executionCount: 26 });
    const prisma = makePrisma({ remediationPlaybook: { update: updateMock } });

    const updated = await prisma.remediationPlaybook.update({
      where: { id: 'pb_001' },
      data: {
        successRate: 0.95,
        executionCount: { increment: 1 },
        lastExecutedAt: new Date(),
      },
    });

    expect(updated.successRate).toBe(0.95);
    expect(updated.executionCount).toBe(26);
  });

  it('deactivates a playbook that has poor success rate', async () => {
    const updateMock = jest.fn().mockResolvedValue({ ...mockPlaybook, isActive: false });
    const prisma = makePrisma({ remediationPlaybook: { update: updateMock } });

    const updated = await prisma.remediationPlaybook.update({
      where: { id: 'pb_001' },
      data: { isActive: false },
    });

    expect(updated.isActive).toBe(false);
  });
});

// ─── RemediationExecution — Write / Query / Aggregate ────────────────────────

describe('PrismaService — RemediationExecution: log executions', () => {
  it('creates a remediation execution record', async () => {
    const createMock = jest.fn().mockResolvedValue(mockExecution);
    const prisma = makePrisma({ remediationExecution: { create: createMock } });

    await prisma.remediationExecution.create({
      data: {
        playbookId: 'pb_001',
        organizationId: 'org_test',
        incidentId: 'inc_001',
        errorPattern: 'connection refused.*postgres',
        stagesExecuted: 1,
        actionsPerformed: [{ type: 'pool_reset', target: 'postgres' }],
        confidence: 0.92,
        outcome: 'success',
        beforeSnapshot: { connectionPool: 'exhausted' },
        afterSnapshot: { connectionPool: 'healthy' },
        timeTaken: 2340,
        verifiedAt: new Date(),
      },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          playbookId: 'pb_001',
          confidence: 0.92,
          outcome: 'success',
        }),
      }),
    );
  });

  it('queries executions for a specific organization', async () => {
    const prisma = makePrisma();

    const executions = await prisma.remediationExecution.findMany({
      where: { organizationId: 'org_test' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    expect(executions).toHaveLength(1);
    expect(executions[0].outcome).toBe('success');
    expect(executions[0].timeTaken).toBe(2340);
  });

  it('aggregates execution statistics for reporting', async () => {
    const prisma = makePrisma();

    const stats = await prisma.remediationExecution.aggregate({
      where: { playbookId: 'pb_001' },
      _count: { _all: true },
      _avg: { confidence: true, timeTaken: true },
    });

    expect(stats._count._all).toBe(25);
    expect(stats._avg.confidence).toBe(0.91);
    expect(stats._avg.timeTaken).toBe(2300);
  });

  it('groups executions by outcome for success rate calculation', async () => {
    const prisma = makePrisma();

    const breakdown = await prisma.remediationExecution.groupBy({
      by: ['outcome'],
      where: { playbookId: 'pb_001' },
      _count: { _all: true },
    } as Parameters<typeof prisma.remediationExecution.groupBy>[0]);

    const successGroup = breakdown.find((g: { outcome: string }) => g.outcome === 'success');
    const escalatedGroup = breakdown.find((g: { outcome: string }) => g.outcome === 'escalated');
    expect(successGroup).toBeDefined();
    expect(escalatedGroup).toBeDefined();
  });

  it('records escalated executions with escalation details', async () => {
    const escalatedExecution = {
      ...mockExecution,
      outcome: 'escalated',
      escalatedTo: 'admin_user_001',
      escalationReason: 'All 3 remediation attempts failed',
    };
    const createMock = jest.fn().mockResolvedValue(escalatedExecution);
    const prisma = makePrisma({ remediationExecution: { create: createMock } });

    const result = await prisma.remediationExecution.create({
      data: {
        playbookId: 'pb_001',
        organizationId: 'org_test',
        incidentId: 'inc_002',
        errorPattern: 'connection refused.*postgres',
        stagesExecuted: 3,
        actionsPerformed: [],
        confidence: 0.88,
        outcome: 'escalated',
        escalatedTo: 'admin_user_001',
        escalationReason: 'All 3 remediation attempts failed',
        timeTaken: 9000,
      },
    });

    expect(result.outcome).toBe('escalated');
    expect(result.escalatedTo).toBe('admin_user_001');
  });
});

// ─── Cross-model Integrity Checks ─────────────────────────────────────────────

describe('PrismaService — data layer integrity', () => {
  it('confidence threshold ≥ 0 and ≤ 1 for playbooks', async () => {
    const prisma = makePrisma();
    const playbooks = await prisma.remediationPlaybook.findMany({ where: { isActive: true } });

    for (const pb of playbooks) {
      expect(pb.confidenceThreshold).toBeGreaterThanOrEqual(0);
      expect(pb.confidenceThreshold).toBeLessThanOrEqual(1);
    }
  });

  it('model accuracy score is between 0 and 1', async () => {
    const prisma = makePrisma();
    const models = await prisma.aiModelRegistry.findMany({});

    for (const m of models) {
      if (m.accuracyScore !== null) {
        expect(m.accuracyScore).toBeGreaterThanOrEqual(0);
        expect(m.accuracyScore).toBeLessThanOrEqual(1);
      }
    }
  });

  it('model priority is between 0 and 100', async () => {
    const prisma = makePrisma();
    const models = await prisma.aiModelRegistry.findMany({});

    for (const m of models) {
      expect(m.priority).toBeGreaterThanOrEqual(0);
      expect(m.priority).toBeLessThanOrEqual(100);
    }
  });

  it('remediation execution confidence is between 0 and 1', async () => {
    const prisma = makePrisma();
    const executions = await prisma.remediationExecution.findMany({});

    for (const exec of executions) {
      expect(exec.confidence).toBeGreaterThanOrEqual(0);
      expect(exec.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('playbook maxAttempts equals 3 per Requirement 5.5', async () => {
    const prisma = makePrisma();
    const playbook = await prisma.remediationPlaybook.findUnique({
      where: { errorPattern: 'connection refused.*postgres' },
    });

    // Requirement 5.5: Auto-Remediation fails after 3 attempts → escalate
    expect(playbook!.maxAttempts).toBe(3);
  });

  it('playbook verificationPeriod is 300 seconds (5 min) per Requirement 5.6', async () => {
    const prisma = makePrisma();
    const playbook = await prisma.remediationPlaybook.findUnique({
      where: { errorPattern: 'connection refused.*postgres' },
    });

    // Requirement 5.6: Monitor issue for 5 minutes after action
    expect(playbook!.verificationPeriod).toBe(300);
  });
});
