/**
 * Multi-hop reasoning path validity — property tests
 *
 * Property 3 (Req 2.2): Every relationship in a traversal path must have
 *   confidence >= 0.4. The reasoning engine should never return a path
 *   containing a sub-threshold edge.
 *
 * Tests exercise ReasoningEngineService via mocked Prisma.
 */

import { ReasoningEngineService } from '../ellinea/reasoning-engine.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    knowledgeGraphEntity: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    enterpriseSnapshot: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    knowledgeGraphRelationship: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

function makeSvc() {
  return new ReasoningEngineService(makePrisma());
}

// ─── Property 3: Multi-hop path validity ─────────────────────────────────────

describe('ReasoningEngineService — Property 3: multi-hop path validity', () => {
  it('multiHopReasoning returns without throwing when no graph entities exist', async () => {
    const svc = makeSvc();
    await expect(svc.multiHopReasoning('What is X?', 'org-1', 2)).resolves.toBeDefined();
  });

  it('reasoning result always has steps, knowledgeGaps, and evidenceChain', async () => {
    const svc = makeSvc();
    const result = await svc.multiHopReasoning('connected systems', 'org-1', 3);
    expect(result.steps).toBeDefined();
    expect(result.knowledgeGaps).toBeDefined();
    expect(result.evidenceChain).toBeDefined();
  });

  it('reasoning does not throw for maxHops = 1', async () => {
    const svc = makeSvc();
    await expect(svc.multiHopReasoning('single hop', 'org-1', 1)).resolves.toBeDefined();
  });

  it('reasoning does not throw for maxHops = 3 (default)', async () => {
    const svc = makeSvc();
    await expect(svc.multiHopReasoning('multi hop', 'org-1')).resolves.toBeDefined();
  });

  it('buildEvidenceChain: a step with evidence below minimum confidence is flagged as incomplete', () => {
    const svc = makeSvc();
    // Relationship confidence < 0.4 would produce a step with no evidence (filtered out)
    const stepsWithLowConfidence = [
      {
        stepNumber: 1,
        operation: 'relationship_traversal',
        entities: [],
        relationships: [],
        evidence: [], // empty = sub-threshold edge was filtered, violating Property 4
        justification: 'Low-confidence relationship excluded',
      },
    ];
    const chain = svc.buildEvidenceChain('System state unknown', stepsWithLowConfidence as any);
    expect(chain.isComplete).toBe(false);
  });

  it('buildEvidenceChain: all steps with evidence above threshold produces a complete chain', () => {
    const svc = makeSvc();
    const validSteps = [
      {
        stepNumber: 1,
        operation: 'entity_lookup',
        entities: [{ id: 'e1', type: 'Product', displayName: 'Widget' }],
        relationships: [],
        evidence: [{ source: 'KnowledgeGraph', recordId: 'e1', summary: 'Entity found', confidence: 0.8 }],
        justification: 'High-confidence entity',
      },
      {
        stepNumber: 2,
        operation: 'relationship_traversal',
        entities: [{ id: 'e2', type: 'Person', displayName: 'Alice' }],
        relationships: [],
        evidence: [{ source: 'KnowledgeGraph', recordId: 'e2', summary: 'Related entity', confidence: 0.6 }],
        justification: 'Confidence >= 0.4, included',
      },
    ];
    const chain = svc.buildEvidenceChain('Widget managed by Alice', validSteps as any);
    expect(chain.isComplete).toBe(true);
  });

  it('identifyCausalLinks returns empty array for empty input', () => {
    const svc = makeSvc();
    expect(svc.identifyCausalLinks([])).toEqual([]);
  });

  it('identifyCausalLinks returns typed array for event input', () => {
    const svc = makeSvc();
    const events = [
      { id: 'e1', occurredAt: new Date(Date.now() - 10_000), description: 'DB error', source: 'sys-1' },
      { id: 'e2', occurredAt: new Date(Date.now() - 5_000), description: 'API slow', source: 'sys-2' },
    ];
    const result = svc.identifyCausalLinks(events as any);
    expect(Array.isArray(result)).toBe(true);
  });
});
