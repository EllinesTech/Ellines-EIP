/**
 * Universal connector engine invariants (spec REQ-1 / REQ-5).
 *
 * The central semantic property under test: a generic RECORD count must never
 * be reported as a CONNECTED-SYSTEM count. Conflating them is the exact defect
 * the spec calls out (a catalogue of 15 books is 15 records, not 15 systems).
 */
import { normalizeEnterprisePayload, parseCsvToEnterprisePayload } from '../index';

describe('normalizeEnterprisePayload — REQ-1 connectedSystems vs recordCount', () => {
  it('maps a generic `count` to recordCount and NOT connectedSystems', () => {
    const p = normalizeEnterprisePayload({ count: 15, business: 'Ellines Haven' });
    expect(p.connectedSystems).toBe(0);
    expect(p.recordCount).toBe(15);
  });

  it('maps an explicit connectedSystems alias correctly', () => {
    const p = normalizeEnterprisePayload({ connectedSystems: 3 });
    expect(p.connectedSystems).toBe(3);
    expect(p.recordCount).toBe(0);
  });

  it('accepts every documented connected-systems alias', () => {
    for (const key of ['connectedSystems', 'connected_systems', 'systems', 'integrations', 'connections']) {
      const p = normalizeEnterprisePayload({ [key]: 4 });
      expect(p.connectedSystems).toBe(4);
      expect(p.recordCount).toBe(0);
    }
  });

  it('accepts every documented record-count alias', () => {
    for (const key of ['recordCount', 'record_count', 'count', 'total', 'length']) {
      const p = normalizeEnterprisePayload({ [key]: 7 });
      expect(p.recordCount).toBe(7);
      expect(p.connectedSystems).toBe(0);
    }
  });

  it('NEVER derives connectedSystems from a record count (the core invariant)', () => {
    for (const n of [1, 15, 999, 1_000_000]) {
      const p = normalizeEnterprisePayload({ count: n, total: n, length: n });
      expect(p.connectedSystems).toBe(0);
      expect(p.recordCount).toBe(n);
    }
  });

  it('keeps both counters independent when both are supplied', () => {
    const p = normalizeEnterprisePayload({ connectedSystems: 2, count: 500 });
    expect(p.connectedSystems).toBe(2);
    expect(p.recordCount).toBe(500);
  });

  it('clamps negative values to zero on both counters', () => {
    const p = normalizeEnterprisePayload({ connectedSystems: -5, count: -9 });
    expect(p.connectedSystems).toBe(0);
    expect(p.recordCount).toBe(0);
  });

  it('unwraps a `data` envelope without losing the distinction', () => {
    const p = normalizeEnterprisePayload({ data: { count: 42, connectedSystems: 1 } });
    expect(p.recordCount).toBe(42);
    expect(p.connectedSystems).toBe(1);
  });

  it('defaults both counters to 0 for an empty payload', () => {
    const p = normalizeEnterprisePayload({});
    expect(p.connectedSystems).toBe(0);
    expect(p.recordCount).toBe(0);
  });
});

describe('parseCsvToEnterprisePayload — honours the same semantics', () => {
  it('does not treat a generic CSV record count as connected systems', () => {
    const p = parseCsvToEnterprisePayload('metric,value\ncount,12\n');
    expect(p.connectedSystems).toBe(0);
    expect(p.recordCount).toBe(12);
  });

  it('maps an explicit connected-systems column', () => {
    const p = parseCsvToEnterprisePayload('metric,value\nconnectedSystems,6\n');
    expect(p.connectedSystems).toBe(6);
  });
});
