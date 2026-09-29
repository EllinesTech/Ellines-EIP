/**
 * haven-connector.spec.ts
 *
 * Test suite for the Universal Connector Engine helpers:
 *  - normalizeEnterprisePayload (Haven Cloud Function JSON shape)
 *  - validateFieldMap (semantic field protection)
 *  - appendDateWindowToUrl (dateWindowEnabled control + custom param names)
 */

import { normalizeEnterprisePayload, validateFieldMap, appendDateWindowToUrl } from '../shared/connectors';

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 – normalizeEnterprisePayload: Haven Cloud Function JSON shape
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeEnterprisePayload — Haven Cloud Function JSON shape', () => {
  /**
   * Haven Cloud Function returns e.g. { "count": 15, "business": "Ellines Haven" }.
   * "count" is a generic record count, NOT a connected-systems number.
   * Expected result:
   *   connectedSystems = 0  (no explicit connected-systems alias in payload)
   *   recordCount      = 15 (picks up "count" alias)
   *   briefHighlight includes "15 records"
   */
  it('maps count → recordCount and NOT connectedSystems', () => {
    const payload = normalizeEnterprisePayload({ count: 15, business: 'Ellines Haven' });

    expect(payload.connectedSystems).toBe(0);
    expect(payload.recordCount).toBe(15);
  });

  it('synthesises briefHighlight mentioning "15 records"', () => {
    const payload = normalizeEnterprisePayload({ count: 15, business: 'Ellines Haven' });

    expect(payload.briefHighlight.toLowerCase()).toContain('15 record');
  });

  it('handles a pure connectedSystems payload correctly', () => {
    const payload = normalizeEnterprisePayload({ connectedSystems: 4, health: 82 });

    expect(payload.connectedSystems).toBe(4);
    expect(payload.recordCount).toBe(0);
    expect(payload.healthScore).toBe(82);
  });

  it('record_count alias maps to recordCount', () => {
    const payload = normalizeEnterprisePayload({ record_count: 9, business: 'Test Org' });

    expect(payload.recordCount).toBe(9);
    expect(payload.connectedSystems).toBe(0);
  });

  it('total alias maps to recordCount', () => {
    const payload = normalizeEnterprisePayload({ total: 42 });

    expect(payload.recordCount).toBe(42);
    expect(payload.connectedSystems).toBe(0);
  });

  it('returns zero recordCount when no count alias present', () => {
    const payload = normalizeEnterprisePayload({ connectedSystems: 2 });

    expect(payload.recordCount).toBe(0);
  });

  it('returns healthScore derived from record data when no explicit health field', () => {
    const payload = normalizeEnterprisePayload({ count: 5, business: 'Acme' });

    // System responded with data → derived health should be ≥ 10 (never 0 for live system)
    expect(payload.healthScore).toBeGreaterThanOrEqual(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 – validateFieldMap
// ─────────────────────────────────────────────────────────────────────────────
describe('validateFieldMap', () => {
  it('warns when mapping to connectedSystems', () => {
    const warnings = validateFieldMap({ count: 'connectedSystems' });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'count' → 'connectedSystems'");
    expect(warnings[0]).toContain('protected EIP semantic field');
  });

  it('warns when mapping to healthScore', () => {
    const warnings = validateFieldMap({ score: 'healthScore' });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'score' → 'healthScore'");
  });

  it('warns when mapping to openAlerts', () => {
    const warnings = validateFieldMap({ errors: 'openAlerts' });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'errors' → 'openAlerts'");
  });

  it('returns empty array for safe field mappings', () => {
    const warnings = validateFieldMap({ systemName: 'briefHighlight', ref: 'sourceSystem' });

    expect(warnings).toHaveLength(0);
  });

  it('returns empty array for undefined fieldMap', () => {
    expect(validateFieldMap(undefined)).toHaveLength(0);
  });

  it('returns empty array for empty fieldMap', () => {
    expect(validateFieldMap({})).toHaveLength(0);
  });

  it('accumulates multiple warnings when multiple protected fields targeted', () => {
    const warnings = validateFieldMap({
      count: 'connectedSystems',
      score: 'healthScore',
    });

    expect(warnings).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 – appendDateWindowToUrl — dateWindowEnabled flag
// ─────────────────────────────────────────────────────────────────────────────
describe('appendDateWindowToUrl — dateWindowEnabled', () => {
  const BASE_URL = 'https://api.example.com/data';
  // Fix a deterministic "now" so date assertions are stable
  const NOW = new Date('2026-01-15T12:00:00.000Z');

  it('returns URL unchanged when dateWindowEnabled is false', () => {
    const result = appendDateWindowToUrl(
      BASE_URL,
      { dateWindow: 'today', dateWindowEnabled: false },
      NOW,
    );

    expect(result).toBe(BASE_URL);
  });

  it('returns URL unchanged when dateWindowEnabled is absent (default off)', () => {
    const result = appendDateWindowToUrl(
      BASE_URL,
      { dateWindow: 'today' },
      NOW,
    );

    expect(result).toBe(BASE_URL);
  });

  it('appends custom param names when dateWindowEnabled and custom params set', () => {
    const result = appendDateWindowToUrl(
      BASE_URL,
      {
        dateWindow: 'today',
        dateWindowEnabled: true,
        dateParamFrom: 'startDate',
        dateParamTo: 'endDate',
      },
      NOW,
    );

    const u = new URL(result);
    expect(u.searchParams.has('startDate')).toBe(true);
    expect(u.searchParams.has('endDate')).toBe(true);
    // EIP generic params must NOT be present
    expect(u.searchParams.has('window')).toBe(false);
    expect(u.searchParams.has('from')).toBe(false);
    expect(u.searchParams.has('to')).toBe(false);
  });

  it('appends EIP generic params when dateWindowEnabled without custom param names', () => {
    const result = appendDateWindowToUrl(
      BASE_URL,
      { dateWindow: 'today', dateWindowEnabled: true },
      NOW,
    );

    const u = new URL(result);
    expect(u.searchParams.get('window')).toBe('today');
    expect(u.searchParams.has('from')).toBe(true);
    expect(u.searchParams.has('to')).toBe(true);
  });

  it('returns URL unchanged when dateWindow is "all" even if enabled', () => {
    const result = appendDateWindowToUrl(
      BASE_URL,
      { dateWindow: 'all', dateWindowEnabled: true },
      NOW,
    );

    expect(result).toBe(BASE_URL);
  });

  it('appends week window correctly with EIP generic params', () => {
    const result = appendDateWindowToUrl(
      BASE_URL,
      { dateWindow: 'week', dateWindowEnabled: true },
      NOW,
    );

    const u = new URL(result);
    expect(u.searchParams.get('window')).toBe('week');
  });
});
