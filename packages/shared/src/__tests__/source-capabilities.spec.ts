/**
 * Phase 4 — capability discovery must never invent a capability.
 *
 * The load-bearing case is a source that answers HTTP 200 for every path with
 * the same body. A naive prober would report Sales, Orders, Payroll and Fleet
 * for a catalogue API. These tests pin the refusal.
 */
import {
  assessProbes,
  deriveRegistryFromResponse,
  findRecordCollections,
  fingerprint,
  readReportedTotal,
} from '../source-capabilities';
import { availableCapabilityCount } from '../capability-registry';

const CATCH_ALL_BODY = {
  success: true,
  api: 'catalogue',
  version: 1,
  business: 'Some Business',
  currency: 'KES',
  count: 3,
  books: [
    { id: '1', title: 'A', price: 100 },
    { id: '2', title: 'B', price: 200 },
    { id: '3', title: 'C', price: 300 },
  ],
};

const ref = { path: '/', status: 200, fingerprint: fingerprint(CATCH_ALL_BODY), bytes: 500 };
const samePath = (p: string) => ({ path: p, status: 200, fingerprint: ref.fingerprint, bytes: 500 });

describe('fingerprint', () => {
  it('is stable across key ordering', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
  });
  it('distinguishes different payloads', () => {
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});

describe('findRecordCollections', () => {
  it('finds a real collection of records', () => {
    const c = findRecordCollections(CATCH_ALL_BODY);
    expect(c).toEqual([{ name: 'books', count: 3, looksLikeRecords: true }]);
  });
  it('ignores arrays of scalars', () => {
    expect(findRecordCollections({ tags: ['a', 'b'] })).toEqual([]);
  });
  it('returns nothing for a payload with no records', () => {
    expect(findRecordCollections({ error: 'nope' })).toEqual([]);
    expect(findRecordCollections(null)).toEqual([]);
  });
});

describe('readReportedTotal', () => {
  it('reads a source-reported total', () => {
    expect(readReportedTotal(CATCH_ALL_BODY)).toBe(3);
  });
  it('returns null when the source published none', () => {
    expect(readReportedTotal({ books: [] })).toBeNull();
  });
});

describe('assessProbes — the anti-fabrication gate', () => {
  it('classifies identical responses as catch-all, not as resources', () => {
    const a = assessProbes(ref, ['/sales', '/orders', '/payroll'].map(samePath));
    expect(a.distinct).toEqual([]);
    expect(a.catchAll).toEqual(['/sales', '/orders', '/payroll']);
    expect(a.sourceIsCatchAll).toBe(true);
  });

  it('treats a genuinely different response as distinct evidence', () => {
    const other = {
      path: '/orders',
      status: 200,
      fingerprint: fingerprint({ orders: [{ id: '1' }] }),
      bytes: 20,
    };
    const a = assessProbes(ref, [samePath('/sales'), other]);
    expect(a.distinct).toEqual(['/orders']);
    expect(a.catchAll).toEqual(['/sales']);
    expect(a.sourceIsCatchAll).toBe(false);
  });

  it('records non-2xx paths as failed, not as capabilities', () => {
    const a = assessProbes(ref, [{ path: '/x', status: 404, fingerprint: '', bytes: 0 }]);
    expect(a.failed).toEqual(['/x']);
    expect(a.distinct).toEqual([]);
  });
});

describe('deriveRegistryFromResponse', () => {
  it('derives exactly the collection the real response contained', () => {
    const d = deriveRegistryFromResponse({
      systemName: 'Some Business',
      payload: CATCH_ALL_BODY,
      paginationObserved: 'none',
    });
    expect(d.registry.resources.map((r) => r.id)).toEqual(['books']);
    expect(d.discovered).toEqual(['books']);
  });

  it('invents NO capability from catch-all probe paths', () => {
    const d = deriveRegistryFromResponse({
      systemName: 'Some Business',
      payload: CATCH_ALL_BODY,
      probes: {
        reference: ref,
        others: ['/sales', '/orders', '/invoices', '/payroll', '/vehicles'].map(samePath),
      },
      paginationObserved: 'none',
    });
    // The trap: all five paths answered 200. None may become a capability.
    expect(d.registry.resources).toHaveLength(1);
    expect(d.registry.resources.map((r) => r.id)).not.toContain('sales');
    expect(d.registry.resources.map((r) => r.id)).not.toContain('orders');
    expect(d.registry.resources.map((r) => r.id)).not.toContain('payroll');
    expect(d.registry.resources.map((r) => r.id)).not.toContain('vehicles');
    expect(d.rejectedPaths).toHaveLength(5);
    expect(d.notes.join(' ')).toMatch(/HTTP 200 alone is not evidence/i);
  });

  it('never marks anything AVAILABLE from discovery alone', () => {
    const d = deriveRegistryFromResponse({
      systemName: 'Some Business',
      payload: CATCH_ALL_BODY,
    });
    expect(availableCapabilityCount(d.registry)).toBe(0);
    expect(d.registry.resources.every((r) => r.availability === 'NOT_YET_SUPPORTED')).toBe(true);
  });

  it('keeps the source-reported total distinct from anything retrieved', () => {
    const d = deriveRegistryFromResponse({
      systemName: 'Some Business',
      payload: CATCH_ALL_BODY,
    });
    expect(d.reportedTotal).toBe(3);
    // retrievedRecordCount is untouched: discovery retrieved nothing.
    expect(d.registry.resources[0].retrievedRecordCount).toBeUndefined();
  });

  it('reports zero resources honestly for a payload with no records', () => {
    const d = deriveRegistryFromResponse({
      systemName: 'Some Business',
      payload: { success: false, message: 'down' },
    });
    expect(d.registry.resources).toHaveLength(0);
    expect(d.notes.join(' ')).toMatch(/no capability could be confirmed/i);
  });

  it('does not claim pagination the source never demonstrated', () => {
    const d = deriveRegistryFromResponse({
      systemName: 'Some Business',
      payload: CATCH_ALL_BODY,
      paginationObserved: 'none',
    });
    expect(d.notes.join(' ')).toMatch(/ignored paging parameters/i);
  });
});
