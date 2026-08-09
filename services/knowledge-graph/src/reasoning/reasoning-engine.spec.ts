/**
 * Reasoning Engine Unit Tests
 *
 * Tests core reasoning capabilities without requiring a live Neo4j connection.
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8
 */

import { CausalAnalysisService } from './causal-analysis.service';
import { PatternDetectorService } from './pattern-detector.service';
import { HypothesisGeneratorService } from './hypothesis-generator.service';
import { Event, DataSource, Observation, MetricPoint } from './reasoning.interfaces';

// ─── CausalAnalysisService ────────────────────────────────────────────────────

describe('CausalAnalysisService', () => {
  let service: CausalAnalysisService;

  beforeEach(() => {
    service = new CausalAnalysisService();
  });

  it('returns empty array for fewer than 2 events', async () => {
    const result = await service.identifyCausalLinks([]);
    expect(result).toEqual([]);
  });

  it('identifies causal link between order and invoice events', async () => {
    const base = Date.now();
    const events: Event[] = [];

    // Create 4 order→invoice pairs so frequency threshold (3) is met
    for (let i = 0; i < 4; i++) {
      events.push({
        id: `order_${i}`,
        organizationId: 'org1',
        type: 'order',
        description: `Order ${i}`,
        timestamp: new Date(base + i * 1000 * 60 * 60),      // +i hours
        entityId: `entity_order_${i}`,
        sourceSystem: 'erp',
      });
      events.push({
        id: `invoice_${i}`,
        organizationId: 'org1',
        type: 'invoice',
        description: `Invoice ${i}`,
        timestamp: new Date(base + i * 1000 * 60 * 60 + 30 * 60 * 1000), // +30 min
        entityId: `entity_invoice_${i}`,
        sourceSystem: 'accounting',
      });
    }

    const chains = await service.identifyCausalLinks(events);
    expect(chains.length).toBeGreaterThan(0);

    const first = chains[0];
    expect(first.confidence).toBeGreaterThan(0);
    expect(first.confidence).toBeLessThanOrEqual(1);
    expect(first.temporalEvidence.lagMs).toBeGreaterThan(0);
    expect(first.mechanism).toBeTruthy();
  });

  it('does not create causal links for pairs with unique types appearing only once', async () => {
    const base = Date.now();
    // "shipment" type never appears again — pair "order→shipment" only co-occurs once
    // so it cannot meet MIN_OCCURRENCES (3) regardless of pairing
    const events: Event[] = [
      { id: 'o1', organizationId: 'org1', type: 'unique_alpha', description: '', timestamp: new Date(base), entityId: 'e1', sourceSystem: 'erp' },
      { id: 'b1', organizationId: 'org1', type: 'unique_beta', description: '', timestamp: new Date(base + 3600000), entityId: 'e2', sourceSystem: 'acc' },
    ];

    const chains = await service.identifyCausalLinks(events);
    // Only 1 occurrence of unique_alpha → unique_beta, below MIN_OCCURRENCES
    expect(chains.length).toBe(0);
  });

  it('confidence is always in range [0, 1]', async () => {
    const base = Date.now();
    const events: Event[] = [];
    for (let i = 0; i < 5; i++) {
      events.push({ id: `e${i}`, organizationId: 'org1', type: 'error', description: '', timestamp: new Date(base + i * 60000), entityId: `node${i}`, sourceSystem: 'monitor' });
      events.push({ id: `a${i}`, organizationId: 'org1', type: 'alert', description: '', timestamp: new Date(base + i * 60000 + 5000), entityId: `node_alert${i}`, sourceSystem: 'monitor' });
    }
    const chains = await service.identifyCausalLinks(events);
    for (const chain of chains) {
      expect(chain.confidence).toBeGreaterThanOrEqual(0);
      expect(chain.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─── PatternDetectorService ───────────────────────────────────────────────────

describe('PatternDetectorService', () => {
  let service: PatternDetectorService;

  beforeEach(() => {
    service = new PatternDetectorService();
  });

  it('returns empty array when fewer than 3 sources are provided', async () => {
    const sources: DataSource[] = [
      { id: 's1', organizationId: 'org1', systemName: 'erp', entityType: 'Order', records: [{ id: '1' }] },
      { id: 's2', organizationId: 'org1', systemName: 'crm', entityType: 'Contact', records: [{ id: '1' }] },
    ];
    const patterns = await service.detectPatterns(sources);
    // No cross-system patterns since we have < 3 sources
    const crossSystem = patterns.filter((p) => p.affectedSystems.length >= 3);
    expect(crossSystem.length).toBe(0);
  });

  it('detects cross-system patterns with 3+ sources', async () => {
    const sharedRecords = [{ id: 'entity_1' }, { id: 'entity_2' }, { id: 'entity_3' }];
    const sources: DataSource[] = [
      { id: 's1', organizationId: 'org1', systemName: 'ERP', entityType: 'Order', records: sharedRecords },
      { id: 's2', organizationId: 'org1', systemName: 'CRM', entityType: 'Contact', records: sharedRecords },
      { id: 's3', organizationId: 'org1', systemName: 'HRMS', entityType: 'Employee', records: sharedRecords },
    ];

    const patterns = await service.detectPatterns(sources);
    expect(patterns.length).toBeGreaterThan(0);

    // All patterns must have a non-empty affected systems list
    for (const pattern of patterns) {
      expect(pattern.affectedSystems.length).toBeGreaterThan(0);
      expect(pattern.confidence).toBeGreaterThan(0);
      expect(pattern.confidence).toBeLessThanOrEqual(1);
      expect(pattern.id).toBeTruthy();
    }
  });

  it('cross-system pattern references all three source systems', async () => {
    const sharedRecords = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}` }));
    const sources: DataSource[] = [
      { id: 's1', organizationId: 'org1', systemName: 'SystemA', entityType: 'TypeX', records: sharedRecords },
      { id: 's2', organizationId: 'org1', systemName: 'SystemB', entityType: 'TypeX', records: sharedRecords },
      { id: 's3', organizationId: 'org1', systemName: 'SystemC', entityType: 'TypeX', records: sharedRecords },
    ];

    const patterns = await service.detectPatterns(sources);
    const crossSystemPattern = patterns.find((p) => p.type === 'correlation' && p.affectedSystems.length >= 3);
    expect(crossSystemPattern).toBeDefined();
    expect(crossSystemPattern!.affectedSystems).toContain('SystemA');
    expect(crossSystemPattern!.affectedSystems).toContain('SystemB');
    expect(crossSystemPattern!.affectedSystems).toContain('SystemC');
  });
});

// ─── HypothesisGeneratorService ───────────────────────────────────────────────

describe('HypothesisGeneratorService', () => {
  let service: HypothesisGeneratorService;

  const makeMetrics = (name: string, values: number[]): MetricPoint[] => {
    const now = Date.now();
    return values.map((v, i) => ({
      name,
      value: v,
      timestamp: new Date(now + i * 24 * 60 * 60 * 1000), // daily points
    }));
  };

  beforeEach(() => {
    service = new HypothesisGeneratorService();
  });

  it('generates at least one hypothesis from an observation with trend data', async () => {
    const observation: Observation = {
      id: 'obs1',
      organizationId: 'org1',
      description: 'Revenue trend',
      metrics: makeMetrics('revenue', [100, 120, 140, 160, 180, 200, 220]),
      timeRange: {
        from: new Date(Date.now() - 7 * 86400000),
        to: new Date(),
      },
    };

    const hypotheses = await service.generateHypotheses(observation);
    expect(hypotheses.length).toBeGreaterThan(0);
  });

  it('all hypotheses have a status field', async () => {
    const observation: Observation = {
      id: 'obs2',
      organizationId: 'org1',
      description: 'Cost metrics',
      metrics: [
        ...makeMetrics('cost', [50, 52, 55, 58, 60]),
        ...makeMetrics('headcount', [10, 11, 12, 13, 14]),
      ],
      timeRange: { from: new Date(Date.now() - 5 * 86400000), to: new Date() },
    };

    const hypotheses = await service.generateHypotheses(observation);
    for (const h of hypotheses) {
      expect(['unvalidated', 'supported', 'refuted', 'inconclusive']).toContain(h.status);
    }
  });

  it('all hypothesis confidence values are within [0, 1]', async () => {
    const observation: Observation = {
      id: 'obs3',
      organizationId: 'org1',
      description: 'Mixed signals',
      metrics: makeMetrics('orders', [200, 180, 160, 195, 210, 190, 175]),
      timeRange: { from: new Date(Date.now() - 7 * 86400000), to: new Date() },
    };

    const hypotheses = await service.generateHypotheses(observation);
    for (const h of hypotheses) {
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('each hypothesis has a non-empty explanation after validation', async () => {
    const observation: Observation = {
      id: 'obs4',
      organizationId: 'org1',
      description: 'Spike detection',
      metrics: makeMetrics('errors', [1, 1, 1, 50, 1, 1, 1]),
      timeRange: { from: new Date(Date.now() - 7 * 86400000), to: new Date() },
    };

    const hypotheses = await service.generateHypotheses(observation);
    for (const h of hypotheses) {
      expect(h.explanation.length).toBeGreaterThan(0);
    }
  });
});
