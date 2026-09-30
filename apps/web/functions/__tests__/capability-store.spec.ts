/**
 * Capability registry wiring (Phases 4/6/7).
 *
 * The registry only matters if it is honest AND actually persisted. These
 * tests pin both: discovery covers the WHOLE published document (not just the
 * handful EIP reads), and only a real retrieval can mark a resource AVAILABLE.
 */
import { buildRegistryFromOpenApi, availableCapabilityCount } from '@ellines-eip/shared';
import { buildInstallationRegistry } from '../shared/capability-store';

const op = (path: string, method = 'GET') => ({
  path,
  method,
  operationId: null,
  summary: null,
  tags: [],
});

describe('buildInstallationRegistry', () => {
  it('discovers EVERY published operation, not only the read subset', () => {
    // 12 resources published; EIP reads 2 of them. All 12 must still appear,
    // otherwise the customer is told their system is smaller than it is.
    const published = [
      '/employees', '/departments', '/attendance', '/leave', '/payroll',
      '/orders', '/customers', '/products', '/invoices', '/payments',
      '/vehicles', '/drivers',
    ].map((p) => op(p));
    const read = ['/employees', '/orders'];

    const registry = buildInstallationRegistry({
      systemName: 'Acme ERP',
      endpoints: published,
      outcomes: read.map((resource) => ({
        resource: resource.slice(1),
        ok: true,
        retrievedRecordCount: 10,
        reportedRecordCount: 10,
        complete: true,
        stopReason: 'complete',
      })),
    });

    expect(registry.resources).toHaveLength(12);
    expect(availableCapabilityCount(registry)).toBe(2);
  });

  it('never marks a resource AVAILABLE from discovery alone', () => {
    const registry = buildInstallationRegistry({
      systemName: 'Acme ERP',
      endpoints: [op('/vehicles'), op('/drivers')],
      outcomes: [],
    });
    expect(availableCapabilityCount(registry)).toBe(0);
    expect(registry.resources.every((r) => r.availability !== 'AVAILABLE')).toBe(true);
  });

  it('maps a truncated read to PARTIAL, not AVAILABLE', () => {
    const registry = buildInstallationRegistry({
      systemName: 'Acme ERP',
      endpoints: [op('/employees')],
      outcomes: [
        {
          resource: 'employees',
          ok: true,
          retrievedRecordCount: 500,
          reportedRecordCount: 1250,
          complete: false,
          stopReason: 'max-pages',
        },
      ],
    });
    const r = registry.resources.find((x) => x.id === 'employees');
    expect(r?.availability).toBe('PARTIAL');
    expect(r?.retrievedRecordCount).toBe(500);
    expect(r?.reportedRecordCount).toBe(1250);
    expect(availableCapabilityCount(registry)).toBe(0);
  });

  it('maps a failed read to UNAVAILABLE and keeps the reason', () => {
    const registry = buildInstallationRegistry({
      systemName: 'Acme ERP',
      endpoints: [op('/payroll')],
      outcomes: [
        {
          resource: 'payroll',
          ok: false,
          retrievedRecordCount: 0,
          reportedRecordCount: 0,
          complete: false,
          stopReason: 'error',
          error: 'HTTP 403',
        },
      ],
    });
    const r = registry.resources.find((x) => x.id === 'payroll');
    expect(r?.availability).toBe('UNAVAILABLE');
    expect(r?.reason).toBe('HTTP 403');
  });

  it('ignores outcomes for resources discovery never found', () => {
    const registry = buildInstallationRegistry({
      systemName: 'Acme ERP',
      endpoints: [op('/orders')],
      outcomes: [
        {
          resource: 'ghost',
          ok: true,
          retrievedRecordCount: 5,
          reportedRecordCount: 5,
          complete: true,
          stopReason: 'complete',
        },
      ],
    });
    // Must not invent a resource just because a result mentioned it.
    expect(registry.resources.map((r) => r.id)).toEqual(['orders']);
  });

  it('an ERP publishing only fleet yields only fleet capabilities', () => {
    const registry = buildRegistryFromOpenApi({
      systemName: 'Acme ERP',
      endpoints: [op('/vehicles'), op('/drivers')],
    });
    const ids = registry.resources.map((r) => r.id).sort();
    expect(ids).toEqual(['drivers', 'vehicles']);
  });
});
