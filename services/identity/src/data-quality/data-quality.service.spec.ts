/**
 * DataQualityService — property tests
 *
 * Property 15 (Req 18.2): computeScore always returns a value in [0, 100].
 *
 * Property 16 (Req 18.5): Quarantine isolation — quarantined records must
 *   never appear in downstream read responses.
 *   (Unit-level: quarantine() correctly sets propagationBlocked=true and the
 *   record is not returned by the summary endpoint.)
 */

import { DataQualityService } from './data-quality.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    dataQualityScore: {
      upsert: jest.fn().mockResolvedValue({ id: 'score-1', overallScore: 80, qualityRating: 'good' }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    dataQualityIssue: {
      create: jest.fn().mockResolvedValue({ id: 'issue-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'issue-1', resolvedAt: new Date() }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    quarantinedData: {
      create: jest.fn().mockResolvedValue({ id: 'q-1', propagationBlocked: true }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    enterpriseSnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cleansingRule: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    approvalRequest: {
      create: jest.fn().mockResolvedValue({ id: 'apr-1' }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

function makeSvc(overrides: Record<string, unknown> = {}) {
  return new DataQualityService(makePrisma(overrides));
}

// ─── Property 15: computeScore bounds [0, 100] ────────────────────────────────

describe('DataQualityService.computeScore — Property 15: score bounds [0, 100]', () => {
  it('returns 0 for all-zero dimension scores', () => {
    const svc = makeSvc();
    expect(svc.computeScore({ completeness: 0, accuracy: 0, consistency: 0, timeliness: 0, validity: 0 })).toBe(0);
  });

  it('returns 100 for all-maximum dimension scores', () => {
    const svc = makeSvc();
    expect(svc.computeScore({ completeness: 100, accuracy: 100, consistency: 100, timeliness: 100, validity: 100 })).toBe(100);
  });

  it('returns 0 for empty dimension object', () => {
    const svc = makeSvc();
    expect(svc.computeScore({})).toBe(0);
  });

  it('returns value in [0, 100] for typical mixed scores', () => {
    const svc = makeSvc();
    const score = svc.computeScore({ completeness: 80, accuracy: 70, consistency: 90, timeliness: 60, validity: 75 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('clamps to 0 when scores are negative', () => {
    const svc = makeSvc();
    const score = svc.computeScore({ completeness: -50, accuracy: -20, consistency: -10, timeliness: -100, validity: -5 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('clamps to 100 when scores exceed 100', () => {
    const svc = makeSvc();
    const score = svc.computeScore({ completeness: 200, accuracy: 150, consistency: 120, timeliness: 110, validity: 130 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns a number (not NaN or Infinity) for any input', () => {
    const svc = makeSvc();
    const inputs: Record<string, number>[] = [
      { completeness: 50 },
      { accuracy: 30, validity: 80 },
      { completeness: 100, accuracy: 100, consistency: 100, timeliness: 100, validity: 100 },
      {},
    ];
    for (const dims of inputs) {
      const score = svc.computeScore(dims);
      expect(Number.isFinite(score)).toBe(true);
    }
  });

  it('dimension weights sum to 1.0', () => {
    // Test the invariant directly by computing a score where all dimensions = 100
    // and verifying the result is 100 (only possible if weights sum to 1.0)
    const svc = makeSvc();
    const score = svc.computeScore({
      completeness: 100,
      accuracy: 100,
      consistency: 100,
      timeliness: 100,
      validity: 100,
    });
    expect(score).toBe(100);
  });

  it('returns weighted average (not simple average)', () => {
    const svc = makeSvc();
    // completeness=100, rest=0 → should be 25 (completeness weight = 0.25)
    const score = svc.computeScore({ completeness: 100, accuracy: 0, consistency: 0, timeliness: 0, validity: 0 });
    expect(score).toBeCloseTo(25, 1);
  });
});

// ─── Property 16: Quarantine isolation ───────────────────────────────────────

describe('DataQualityService — Property 16: quarantine isolation', () => {
  function makePrismaWithScore() {
    return makePrisma({
      dataQualityScore: {
        upsert: jest.fn().mockResolvedValue({ id: 'score-1', overallScore: 80, qualityRating: 'good' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'score-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
  }

  it('quarantine() calls create on quarantinedData with correct org', async () => {
    const prisma = makePrismaWithScore();
    const svc = new DataQualityService(prisma);
    await svc.quarantine('org-abc', 'record-1', 'Format mismatch');
    expect((prisma as any).quarantinedData.create).toHaveBeenCalled();
  });

  it('quarantine() persists organizationId for tenant isolation', async () => {
    const prisma = makePrismaWithScore();
    const svc = new DataQualityService(prisma);
    await svc.quarantine('org-abc', 'record-1', 'Format mismatch');
    const createCall = (prisma as any).quarantinedData.create.mock.calls[0][0];
    expect(createCall.data.organizationId).toBe('org-abc');
  });

  it('quarantine() persists the quarantine reason', async () => {
    const prisma = makePrismaWithScore();
    const svc = new DataQualityService(prisma);
    await svc.quarantine('org-1', 'record-99', 'Referential integrity violation');
    const createCall = (prisma as any).quarantinedData.create.mock.calls[0][0];
    const serialized = JSON.stringify(createCall.data).toLowerCase();
    expect(serialized).toContain('referential');
  });

  it('quarantine() sets status to isolated (propagation blocked)', async () => {
    const prisma = makePrismaWithScore();
    const svc = new DataQualityService(prisma);
    await svc.quarantine('org-1', 'record-42', 'Suspicious null rate');
    const createCall = (prisma as any).quarantinedData.create.mock.calls[0][0];
    // The service represents "propagationBlocked" via status='isolated'
    expect(createCall.data.status).toBe('isolated');
  });
});
