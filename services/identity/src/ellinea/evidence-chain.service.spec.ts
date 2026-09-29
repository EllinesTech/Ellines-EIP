/**
 * Evidence chain completeness — property tests
 *
 * Property 4 (Req 2.6): Every conclusion must have at least one evidence item
 *   per reasoning step in its chain.
 *
 * Tests exercise ReasoningEngineService's buildEvidenceChain and
 * identifyCausalLinks to verify the completeness constraint.
 */

import { ReasoningEngineService } from './reasoning-engine.service';
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

// ─── Property 4: Evidence chain completeness ──────────────────────────────────

describe('ReasoningEngineService — Property 4: evidence chain completeness', () => {
  it('buildEvidenceChain with no steps returns an isComplete=false chain', () => {
    const svc = makeSvc();
    const chain = svc.buildEvidenceChain('Some conclusion', []);
    expect(chain).toBeDefined();
    expect(chain.isComplete).toBe(false);
  });

  it('buildEvidenceChain with a step that has evidence returns isComplete=true', () => {
    const svc = makeSvc();
    const stepsWithEvidence = [
      {
        stepNumber: 1,
        operation: 'entity_lookup',
        entities: [],
        relationships: [],
        evidence: [{ source: 'EnterpriseSnapshot', recordId: 'snap-1', summary: 'System healthy' }],
        justification: 'Found active system',
      },
    ];
    const chain = svc.buildEvidenceChain('System is healthy', stepsWithEvidence as any);
    expect(chain.isComplete).toBe(true);
  });

  it('buildEvidenceChain with a step missing evidence returns isComplete=false', () => {
    const svc = makeSvc();
    const stepsNoEvidence = [
      {
        stepNumber: 1,
        operation: 'entity_lookup',
        entities: [],
        relationships: [],
        evidence: [], // empty — violates Property 4
        justification: 'No data found',
      },
    ];
    const chain = svc.buildEvidenceChain('Unknown state', stepsNoEvidence as any);
    expect(chain.isComplete).toBe(false);
  });

  it('buildEvidenceChain always returns a chain object with a conclusion field', () => {
    const svc = makeSvc();
    const chain = svc.buildEvidenceChain('connector failure', []);
    expect(chain.conclusion).toBe('connector failure');
  });

  it('buildEvidenceChain returns a chain with steps array', () => {
    const svc = makeSvc();
    const chain = svc.buildEvidenceChain('test', []);
    expect(Array.isArray(chain.steps)).toBe(true);
  });

  it('identifyCausalLinks returns an array (even if empty)', () => {
    const svc = makeSvc();
    const result = svc.identifyCausalLinks([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('identifyCausalLinks with non-empty events returns typed results', () => {
    const svc = makeSvc();
    const events = [
      { id: 'e1', occurredAt: new Date(Date.now() - 10_000), description: 'DB error', source: 'connector-1' },
      { id: 'e2', occurredAt: new Date(Date.now() - 5_000), description: 'API slow', source: 'connector-2' },
      { id: 'e3', occurredAt: new Date(), description: 'Alert fired', source: 'connector-3' },
    ];
    const links = svc.identifyCausalLinks(events as any);
    expect(Array.isArray(links)).toBe(true);
  });

  it('multiHopReasoning result has steps and knowledgeGaps defined', async () => {
    const svc = makeSvc();
    const result = await svc.multiHopReasoning('inventory levels', 'org-1', 2);
    expect(result.steps).toBeDefined();
    expect(Array.isArray(result.steps)).toBe(true);
    expect(Array.isArray(result.knowledgeGaps)).toBe(true);
  });

  it('multiHopReasoning result has evidenceChain', async () => {
    const svc = makeSvc();
    const result = await svc.multiHopReasoning('system health', 'org-1');
    expect(result.evidenceChain).toBeDefined();
  });
});
