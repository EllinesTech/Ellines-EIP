/**
 * CrossSystemSearchService — property tests
 *
 * Property 11 (Req 33.3): Search result relevance ordering.
 *   No lower-ranked item may appear above a higher-ranked item.
 *
 * Property 12 (Req 33.5): Facet filtering correctness.
 *   Every result after refineResults matches the filter; no non-matching
 *   result is included.
 */

import { CrossSystemSearchService, SearchRefinements } from './cross-system-search.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchResult = Awaited<ReturnType<CrossSystemSearchService['search']>>[number];

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    enterpriseSnapshot: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    approvalRequest: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

function makeSvc() {
  return new CrossSystemSearchService(makePrisma());
}

function makeResult(
  id: string,
  relevanceScore: number,
  sourceSystem = 'EIP',
  type = 'snapshot',
): SearchResult {
  return {
    id,
    type,
    title: `Result ${id}`,
    summary: `Summary for ${id}`,
    sourceSystem,
    relevanceScore,
    url: `/app/${id}`,
    createdAt: new Date(),
  };
}

// ─── Property 11: Relevance ordering ──────────────────────────────────────────

describe('CrossSystemSearchService — Property 11: relevance ordering', () => {
  it('refineResults preserves descending relevance order', () => {
    const svc = makeSvc();
    // Build a pre-sorted list (as search() would return it)
    const results = [
      makeResult('r1', 90),
      makeResult('r2', 75),
      makeResult('r3', 60),
      makeResult('r4', 45),
      makeResult('r5', 20),
    ];
    // Refine with a broad filter that keeps all items
    const refined = svc.refineResults(results, { sourceSystem: 'EIP' });
    for (let i = 0; i < refined.length - 1; i++) {
      expect(refined[i].relevanceScore).toBeGreaterThanOrEqual(refined[i + 1].relevanceScore);
    }
  });

  it('refineResults never increases result count', () => {
    const svc = makeSvc();
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`r${i}`, 100 - i * 5));
    const refined = svc.refineResults(results, { type: 'snapshot' });
    expect(refined.length).toBeLessThanOrEqual(results.length);
  });

  it('empty input returns empty output', () => {
    const svc = makeSvc();
    expect(svc.refineResults([], {})).toHaveLength(0);
  });

  it('no-op refinement with empty constraints preserves all results', () => {
    const svc = makeSvc();
    const results = [makeResult('r1', 80), makeResult('r2', 60)];
    expect(svc.refineResults(results, {})).toHaveLength(2);
  });
});

// ─── Property 12: Facet filtering correctness ─────────────────────────────────

describe('CrossSystemSearchService — Property 12: facet filtering correctness', () => {
  it('sourceSystem filter: all returned results match the filter', () => {
    const svc = makeSvc();
    const results = [
      makeResult('r1', 90, 'crm'),
      makeResult('r2', 80, 'erp'),
      makeResult('r3', 70, 'crm'),
      makeResult('r4', 60, 'his'),
    ];
    const refined = svc.refineResults(results, { sourceSystem: 'crm' });
    expect(refined.length).toBeGreaterThan(0);
    for (const r of refined) {
      expect(r.sourceSystem.toLowerCase()).toBe('crm');
    }
  });

  it('sourceSystem filter: no non-matching result is included', () => {
    const svc = makeSvc();
    const results = [
      makeResult('r1', 90, 'crm'),
      makeResult('r2', 80, 'erp'),
    ];
    const refined = svc.refineResults(results, { sourceSystem: 'erp' });
    expect(refined.every((r) => r.sourceSystem.toLowerCase() === 'erp')).toBe(true);
  });

  it('sourceSystem filter is case-insensitive', () => {
    const svc = makeSvc();
    const results = [makeResult('r1', 80, 'CRM'), makeResult('r2', 70, 'erp')];
    const refined = svc.refineResults(results, { sourceSystem: 'crm' });
    expect(refined).toHaveLength(1);
    expect(refined[0].id).toBe('r1');
  });

  it('type filter: all returned results match the type', () => {
    const svc = makeSvc();
    const results = [
      makeResult('r1', 90, 'EIP', 'snapshot'),
      makeResult('r2', 80, 'EIP', 'audit_log'),
      makeResult('r3', 70, 'EIP', 'snapshot'),
    ];
    const refined = svc.refineResults(results, { type: 'snapshot' });
    expect(refined.length).toBe(2);
    for (const r of refined) {
      expect(r.type.toLowerCase()).toBe('snapshot');
    }
  });

  it('date from/to filter: no result outside the range is included', () => {
    const svc = makeSvc();
    const now = new Date('2026-01-15T12:00:00Z');
    const results = [
      { ...makeResult('r1', 90), createdAt: new Date('2026-01-10T00:00:00Z') },
      { ...makeResult('r2', 80), createdAt: new Date('2026-01-14T00:00:00Z') },
      { ...makeResult('r3', 70), createdAt: new Date('2026-01-16T00:00:00Z') },
    ];
    const from = new Date('2026-01-13T00:00:00Z');
    const to = new Date('2026-01-15T23:59:59Z');
    const refined = svc.refineResults(results, { from, to });
    for (const r of refined) {
      expect(r.createdAt.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(r.createdAt.getTime()).toBeLessThanOrEqual(to.getTime());
    }
  });

  it('combined filters: all criteria must be satisfied simultaneously', () => {
    const svc = makeSvc();
    const results = [
      makeResult('r1', 90, 'crm', 'snapshot'),
      makeResult('r2', 80, 'crm', 'audit_log'),
      makeResult('r3', 70, 'erp', 'snapshot'),
    ];
    const refined = svc.refineResults(results, { sourceSystem: 'crm', type: 'snapshot' });
    expect(refined).toHaveLength(1);
    expect(refined[0].id).toBe('r1');
  });

  it('filter that matches nothing returns empty array', () => {
    const svc = makeSvc();
    const results = [makeResult('r1', 90, 'crm'), makeResult('r2', 80, 'erp')];
    const refined = svc.refineResults(results, { sourceSystem: 'his' });
    expect(refined).toHaveLength(0);
  });
});

// ─── search() edge cases ───────────────────────────────────────────────────────

describe('CrossSystemSearchService.search — edge cases', () => {
  it('returns empty array for empty query without calling DB', async () => {
    const prisma = makePrisma();
    const svc = new CrossSystemSearchService(prisma);
    const result = await svc.search('', 'org-1');
    expect(result).toHaveLength(0);
    // No DB calls should have been made
    expect((prisma as any).enterpriseSnapshot.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only query', async () => {
    const svc = makeSvc();
    expect(await svc.search('   ', 'org-1')).toHaveLength(0);
  });
});

// ─── getSuggestions edge cases ────────────────────────────────────────────────

describe('CrossSystemSearchService.getSuggestions — edge cases', () => {
  it('returns empty array for partial length < 2', async () => {
    const svc = makeSvc();
    expect(await svc.getSuggestions('', 'org-1')).toHaveLength(0);
    expect(await svc.getSuggestions('a', 'org-1')).toHaveLength(0);
  });

  it('returns at most 10 suggestions', async () => {
    const prisma = makePrisma();
    // Mock 20 audit log rows that all start with "co"
    const logs = Array.from({ length: 20 }, (_, i) => ({
      action: `connector.${i}.sync`,
      resource: `resource-${i}`,
    }));
    (prisma as any).auditLog.findMany = jest.fn().mockResolvedValue(logs);
    const svc = new CrossSystemSearchService(prisma);
    const suggestions = await svc.getSuggestions('co', 'org-1');
    expect(suggestions.length).toBeLessThanOrEqual(10);
  });
});
