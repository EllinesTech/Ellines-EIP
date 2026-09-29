/**
 * AlertCorrelationService — property tests
 *
 * Property 7 (Req 12.1): All alerts in a cluster fall within the configured
 *   time window from the cluster's first alert.
 *
 * Property 8 (Req 12.2): Each cluster with >= 2 alerts has exactly one
 *   non-null rootCause.
 */

import {
  AlertCorrelationService,
  AlertCluster,
  AlertInput,
} from './alert-correlation.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

function makeSvc() {
  return new AlertCorrelationService(makePrisma());
}

function makeAlert(
  id: string,
  offsetMs: number,
  overrides: Partial<AlertInput> = {},
): AlertInput {
  return {
    id,
    source: 'test-source',
    errorCode: 'E001',
    component: 'api-gateway',
    timestamp: new Date(BASE_TIME + offsetMs),
    ...overrides,
  };
}

const BASE_TIME = new Date('2026-01-15T10:00:00.000Z').getTime();
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ─── Property 7: Alert cluster time window ────────────────────────────────────

describe('AlertCorrelationService — Property 7: cluster time window', () => {
  it('all alerts in a cluster are within windowMs of the anchor alert', async () => {
    const svc = makeSvc();
    // Create 4 alerts sharing a component, all within the window
    const alerts = [
      makeAlert('a1', 0),
      makeAlert('a2', 60_000),   // +1 min
      makeAlert('a3', 120_000),  // +2 min
      makeAlert('a4', 240_000),  // +4 min
    ];
    const clusters = await svc.correlateAlerts(alerts, WINDOW_MS);
    for (const cluster of clusters) {
      const anchor = cluster.windowStartMs;
      for (const alert of cluster.alerts) {
        expect(alert.timestamp.getTime()).toBeGreaterThanOrEqual(anchor);
        expect(alert.timestamp.getTime()).toBeLessThanOrEqual(anchor + WINDOW_MS);
      }
    }
  });

  it('alert outside the window is not included in the same cluster', async () => {
    const svc = makeSvc();
    const alerts = [
      makeAlert('a1', 0),
      makeAlert('a2', 60_000),     // +1 min — within window
      makeAlert('a3', WINDOW_MS + 1_000), // just outside window — different cluster or ungrouped
    ];
    const clusters = await svc.correlateAlerts(alerts, WINDOW_MS);
    for (const cluster of clusters) {
      const anchor = cluster.windowStartMs;
      for (const alert of cluster.alerts) {
        expect(alert.timestamp.getTime()).toBeLessThanOrEqual(anchor + WINDOW_MS);
      }
    }
  });

  it('no cluster contains an alert from a different correlation axis', async () => {
    const svc = makeSvc();
    // Two groups — different components, no shared axis
    const alerts = [
      makeAlert('a1', 0, { component: 'db', userId: undefined, connectorId: undefined }),
      makeAlert('a2', 30_000, { component: 'db', userId: undefined, connectorId: undefined }),
      makeAlert('a3', 60_000, { component: 'cache', userId: undefined, connectorId: undefined }),
      makeAlert('a4', 90_000, { component: 'cache', userId: undefined, connectorId: undefined }),
    ];
    const clusters = await svc.correlateAlerts(alerts, WINDOW_MS);
    // db group and cache group must not be mixed
    for (const cluster of clusters) {
      const components = new Set(cluster.alerts.map((a) => a.component));
      // A cluster may have multiple components only if they share another axis (userId/connectorId)
      // Since none share userId or connectorId here, each cluster should be homogeneous
      if (cluster.alerts.some((a) => a.component === 'db')) {
        expect(cluster.alerts.every((a) => a.component === 'db')).toBe(true);
      }
      if (cluster.alerts.some((a) => a.component === 'cache')) {
        expect(cluster.alerts.every((a) => a.component === 'cache')).toBe(true);
      }
    }
  });

  it('returns empty array for empty input', async () => {
    const svc = makeSvc();
    expect(await svc.correlateAlerts([])).toEqual([]);
  });

  it('property holds with a custom narrow 1-minute window', async () => {
    const svc = makeSvc();
    const NARROW = 60_000; // 1 min
    const alerts = [
      makeAlert('a1', 0),
      makeAlert('a2', 30_000),   // +30 s — within 1 min
      makeAlert('a3', 90_000),   // +90 s — outside 1 min from a1
    ];
    const clusters = await svc.correlateAlerts(alerts, NARROW);
    for (const cluster of clusters) {
      const anchor = cluster.windowStartMs;
      for (const alert of cluster.alerts) {
        expect(alert.timestamp.getTime()).toBeLessThanOrEqual(anchor + NARROW);
      }
    }
  });
});

// ─── Property 8: Root cause uniqueness ───────────────────────────────────────

describe('AlertCorrelationService — Property 8: root cause uniqueness', () => {
  it('identifyRootCause returns non-null rootCause for cluster with >= 2 alerts', () => {
    const svc = makeSvc();
    const alerts = [
      makeAlert('a1', 0),
      makeAlert('a2', 10_000),
      makeAlert('a3', 20_000),
    ];
    const draft: AlertCluster = {
      clusterId: 'c1',
      alerts,
      rootCause: null,
      windowStartMs: BASE_TIME,
      windowEndMs: BASE_TIME + WINDOW_MS,
      createdAt: new Date(),
    };
    const result = svc.identifyRootCause(draft);
    expect(result.rootCause).not.toBeNull();
  });

  it('exactly one alert in cluster is identified as root cause', () => {
    const svc = makeSvc();
    const alerts = [
      makeAlert('a1', 0),
      makeAlert('a2', 5_000),
      makeAlert('a3', 10_000),
      makeAlert('a4', 15_000),
    ];
    const draft: AlertCluster = {
      clusterId: 'c2',
      alerts,
      rootCause: null,
      windowStartMs: BASE_TIME,
      windowEndMs: BASE_TIME + WINDOW_MS,
      createdAt: new Date(),
    };
    const result = svc.identifyRootCause(draft);
    expect(result.rootCause).not.toBeNull();
    // Root cause must be one of the member alerts
    const rootId = result.rootCause!.id;
    const memberIds = alerts.map((a) => a.id);
    expect(memberIds).toContain(rootId);
  });

  it('root cause is the first alert (earliest timestamp)', () => {
    const svc = makeSvc();
    // a1 is earliest and precedes >= 2 others
    const alerts = [
      makeAlert('a1', 0),
      makeAlert('a2', 30_000),
      makeAlert('a3', 60_000),
    ];
    const draft: AlertCluster = {
      clusterId: 'c3',
      alerts,
      rootCause: null,
      windowStartMs: BASE_TIME,
      windowEndMs: BASE_TIME + WINDOW_MS,
      createdAt: new Date(),
    };
    const result = svc.identifyRootCause(draft);
    expect(result.rootCause!.id).toBe('a1');
  });

  it('single-alert cluster has non-null rootCause (the alert itself)', () => {
    const svc = makeSvc();
    const alerts = [makeAlert('solo', 0)];
    const draft: AlertCluster = {
      clusterId: 'c4',
      alerts,
      rootCause: null,
      windowStartMs: BASE_TIME,
      windowEndMs: BASE_TIME + WINDOW_MS,
      createdAt: new Date(),
    };
    const result = svc.identifyRootCause(draft);
    expect(result.rootCause).not.toBeNull();
    expect(result.rootCause!.id).toBe('solo');
  });

  it('empty-alert cluster returns null rootCause', () => {
    const svc = makeSvc();
    const draft: AlertCluster = {
      clusterId: 'c5',
      alerts: [],
      rootCause: null,
      windowStartMs: BASE_TIME,
      windowEndMs: BASE_TIME + WINDOW_MS,
      createdAt: new Date(),
    };
    const result = svc.identifyRootCause(draft);
    expect(result.rootCause).toBeNull();
  });
});

// ─── calculateUrgency bounds ───────────────────────────────────────────────────

describe('AlertCorrelationService — calculateUrgency bounds', () => {
  it('urgency is always between 0 and 100 for normal inputs', () => {
    const svc = makeSvc();
    const cases: Partial<AlertInput>[] = [
      { businessImpact: 0, affectedUsers: 0, dependencyDepth: 0 },
      { businessImpact: 1, affectedUsers: 1, dependencyDepth: 1 },
      { businessImpact: 0.5, affectedUsers: 0.5, dependencyDepth: 0.5 },
      { businessImpact: 0.3, affectedUsers: 0.7, dependencyDepth: 0.1 },
    ];
    for (const partial of cases) {
      const alert = makeAlert('u1', 0, partial);
      const urgency = svc.calculateUrgency(alert);
      expect(urgency).toBeGreaterThanOrEqual(0);
      expect(urgency).toBeLessThanOrEqual(100);
    }
  });

  it('urgency is clamped to [0, 100] for over-range inputs', () => {
    const svc = makeSvc();
    // Values > 1 — should still produce a result in [0, 100]
    const alert = makeAlert('u2', 0, { businessImpact: 2, affectedUsers: 3, dependencyDepth: 5 });
    const urgency = svc.calculateUrgency(alert);
    expect(urgency).toBeGreaterThanOrEqual(0);
    expect(urgency).toBeLessThanOrEqual(100);
  });

  it('urgency is 0 when all dimensions are 0', () => {
    const svc = makeSvc();
    const alert = makeAlert('u3', 0, { businessImpact: 0, affectedUsers: 0, dependencyDepth: 0 });
    expect(svc.calculateUrgency(alert)).toBe(0);
  });

  it('urgency is 100 for maximum dimensions', () => {
    const svc = makeSvc();
    const alert = makeAlert('u4', 0, { businessImpact: 1, affectedUsers: 1, dependencyDepth: 1 });
    expect(svc.calculateUrgency(alert)).toBe(100);
  });
});
