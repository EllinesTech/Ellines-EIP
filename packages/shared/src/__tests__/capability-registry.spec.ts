/**
 * Universal capability registry tests.
 *
 * The properties that matter:
 *  1. Capabilities come from the SOURCE, never from a hardcoded category map.
 *  2. A source exposing only fleet data yields only fleet capabilities, even
 *     if it is called "ERP".
 *  3. Discovery alone never yields AVAILABLE — only a real retrieval does.
 *  4. A truncated retrieval yields PARTIAL, never "healthy".
 *  5. Nothing is invented for a source that exposes nothing.
 */
import {
  buildRegistryFromOpenApi,
  applyRetrievalResult,
  inferRelationships,
  groupByDomain,
  availableCapabilityCount,
  humanize,
  inferResourceId,
  inferDomain,
  type DiscoveredResource,
} from '../capability-registry';
import type { EndpointDef } from '../openapi-importer';

const ep = (path: string, method: EndpointDef['method'] = 'GET', tags: string[] = []): EndpointDef => ({
  path,
  method,
  operationId: null,
  summary: null,
  tags,
  requestContentType: null,
  responseContentType: 'application/json',
  requiresAuth: true,
});

describe('resource identity', () => {
  it('collapses generic path segments', () => {
    expect(inferResourceId('/api/v1/employees')).toBe('employees');
    expect(inferResourceId('/api/v1/vehicles/')).toBe('vehicles');
    expect(inferResourceId('/api/v1/data/orders')).toBe('orders');
    expect(inferResourceId('/v2/sales/orders')).toBe('orders');
  });
  it('humanizes without inventing meaning', () => {
    expect(humanize('employees')).toBe('Employees');
    expect(humanize('fuel_logs')).toBe('Fuel Logs');
  });
  it('prefers the source own OpenAPI tag over a path guess', () => {
    expect(inferDomain('/api/v1/vehicles', ['Fleet'])).toBe('Fleet');
    expect(inferDomain('/api/hr/employees')).toBe('Hr');
    expect(inferDomain('/employees')).toBeUndefined();
  });
});

describe('discovery reflects the source, not a category table', () => {
  it('an "ERP" exposing only fleet data yields only fleet capabilities', () => {
    const reg = buildRegistryFromOpenApi({
      systemName: 'Acme ERP',
      endpoints: [ep('/api/v1/vehicles'), ep('/api/v1/drivers'), ep('/api/v1/fuel_logs')],
      now: '2026-01-01T00:00:00.000Z',
    });
    expect(reg.systemName).toBe('Acme ERP');
    expect(reg.resources.map((r) => r.id).sort()).toEqual(['drivers', 'fuel_logs', 'vehicles']);
    // No HR, sales or finance may appear just because it is called an ERP.
    const ids = reg.resources.map((r) => r.id).join(',');
    expect(ids).not.toMatch(/employee|sales|invoice|payroll/);
  });

  it('honours the source own module tags for grouping', () => {
    const reg = buildRegistryFromOpenApi({
      systemName: 'Anything',
      endpoints: [
        ep('/api/vehicles', 'GET', ['Fleet']),
        ep('/api/drivers', 'GET', ['Fleet']),
        ep('/api/employees', 'GET', ['Hr']),
      ],
    });
    const grouped = groupByDomain(reg);
    expect(Object.keys(grouped).sort()).toEqual(['Fleet', 'Hr']);
    expect(grouped.Fleet).toHaveLength(2);
  });

  it('a source exposing nothing yields zero capabilities, not a default set', () => {
    const reg = buildRegistryFromOpenApi({ systemName: 'Empty', endpoints: [] });
    expect(reg.resources).toEqual([]);
    expect(availableCapabilityCount(reg)).toBe(0);
  });

  it('merges operations that target the same resource', () => {
    const reg = buildRegistryFromOpenApi({
      systemName: 'S',
      endpoints: [ep('/api/orders', 'GET'), ep('/api/orders', 'POST')],
    });
    expect(reg.resources).toHaveLength(1);
    expect(reg.resources[0].operations.sort()).toEqual(['GET', 'POST']);
  });
});


describe('availability is evidence-based, never optimistic', () => {
  it('discovery alone does NOT mark a resource AVAILABLE', () => {
    const reg = buildRegistryFromOpenApi({ systemName: 'S', endpoints: [ep('/api/employees')] });
    expect(reg.resources[0].availability).not.toBe('AVAILABLE');
    expect(availableCapabilityCount(reg)).toBe(0);
  });

  it('a real complete retrieval is what makes it AVAILABLE', () => {
    let reg = buildRegistryFromOpenApi({ systemName: 'S', endpoints: [ep('/api/employees')] });
    reg = applyRetrievalResult(reg, {
      resourceId: 'employees',
      availability: 'AVAILABLE',
      retrievedRecordCount: 1250,
      reportedRecordCount: 1250,
      complete: true,
    });
    expect(reg.resources[0].availability).toBe('AVAILABLE');
    expect(availableCapabilityCount(reg)).toBe(1);
  });

  it('a truncated retrieval is PARTIAL, never healthy', () => {
    let reg = buildRegistryFromOpenApi({ systemName: 'S', endpoints: [ep('/api/employees')] });
    reg = applyRetrievalResult(reg, {
      resourceId: 'employees',
      availability: 'PARTIAL',
      reason: 'Source reported 1250; retrieved 500.',
      retrievedRecordCount: 500,
      reportedRecordCount: 1250,
      complete: false,
    });
    const r = reg.resources[0];
    expect(r.availability).toBe('PARTIAL');
    expect(r.complete).toBe(false);
    expect(r.retrievedRecordCount).toBe(500);
    expect(r.reportedRecordCount).toBe(1250);
  });

  it('marks resources the credential may not read as NOT_AUTHORIZED', () => {
    const reg = buildRegistryFromOpenApi({
      systemName: 'S',
      endpoints: [ep('/api/payroll'), ep('/api/sales')],
      forbidden: ['/api/payroll'],
    });
    expect(reg.resources.find((r) => r.id === 'payroll')?.availability).toBe('NOT_AUTHORIZED');
    // Discovered but not yet read must not be presented as available.
    expect(reg.resources.find((r) => r.id === 'sales')?.availability).not.toBe('AVAILABLE');
  });
});

describe('pagination is read from the source, not assumed', () => {
  it('reports unknown when the source documented no parameters', () => {
    const reg = buildRegistryFromOpenApi({ systemName: 'S', endpoints: [ep('/api/orders')] });
    expect(reg.resources[0].pagination).toBe('unknown');
  });
  it('detects documented styles', () => {
    const reg = buildRegistryFromOpenApi({
      systemName: 'S',
      endpoints: [ep('/api/a'), ep('/api/b'), ep('/api/c')],
      parametersByPath: {
        '/api/a': ['page', 'pageSize'],
        '/api/b': ['cursor'],
        '/api/c': ['offset', 'limit'],
      },
    });
    expect(reg.resources.find((r) => r.id === 'a')?.pagination).toBe('page');
    expect(reg.resources.find((r) => r.id === 'b')?.pagination).toBe('cursor');
    expect(reg.resources.find((r) => r.id === 'c')?.pagination).toBe('offset');
  });
});

describe('relationships are preserved, and marked as inferred', () => {
  it('links orders.customerId to customers without flattening them', () => {
    const resources: DiscoveredResource[] = [
      { id: 'orders', label: 'Orders', path: '/api/orders', operations: ['GET'], pagination: 'unknown', availability: 'AVAILABLE', fields: ['id', 'customerId', 'total'] },
      { id: 'customers', label: 'Customers', path: '/api/customers', operations: ['GET'], pagination: 'unknown', availability: 'AVAILABLE', fields: ['id', 'name'] },
    ];
    expect(inferRelationships(resources)).toEqual([
      { from: 'orders', field: 'customerId', to: 'customers', origin: 'inferred' },
    ]);
  });

  it('does not invent a relationship to a resource that does not exist', () => {
    const resources: DiscoveredResource[] = [
      { id: 'orders', label: 'Orders', path: '/api/orders', operations: ['GET'], pagination: 'unknown', availability: 'AVAILABLE', fields: ['customerId'] },
    ];
    expect(inferRelationships(resources)).toEqual([]);
  });
});

