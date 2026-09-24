/**
 * P1 — Ellines Haven Connector Experiment (corrected)
 *
 * Demonstrates that EIP can connect to any business system that exposes data
 * through the Firestore REST API, without EIP containing any knowledge of
 * that business system's domain model.
 *
 * The specific target used for the P1 experiment is Ellines Haven's
 * books_catalogue document, accessed via the public Firestore REST endpoint.
 * EIP treats it as "a REST endpoint that happens to return Firestore-format
 * JSON" — the generic normalizer unpacks the typed values and
 * normalizeEnterprisePayload infers enterprise fields from whatever is returned.
 * No Haven-specific field mapping exists inside EIP.
 *
 * Tests:
 *  1. SSRF policy accepts the Haven Firestore endpoint (static, no network)
 *  2. isFirestoreResponse — structural detection of Firestore wire format
 *  3. unpackFirestoreValue — every typed-value kind
 *  4. normalizeFirestoreResponse — single doc and collection
 *  5. End-to-end: raw Firestore JSON → normalizeEnterprisePayload (generic pipeline)
 *  6. Live integration (HAVEN_LIVE_TEST=1) — real HTTP, no mock
 */

import {
  isFirestoreResponse,
  unpackFirestoreValue,
  unpackFirestoreFields,
  normalizeFirestoreResponse,
} from '../shared/firestore-normalizer';
import { isSafeEgressTarget } from '../shared/egress';
import { normalizeEnterprisePayload } from '../shared/connectors';

// ── Real Haven endpoint under test ──────────────────────────────────────────
// This is the Firestore REST API URL for Haven's books_catalogue document.
// EIP stores this as a plain REST endpoint in the connector's config.endpoint
// field — the same field used for any other REST connector. EIP does not know
// it is Haven, nor does it know the data is in Firestore format until it
// inspects the wire response.
const HAVEN_BOOKS_ENDPOINT =
  'https://firestore.googleapis.com/v1/projects/ellines-haven-web/databases/(default)/documents/site_data/books_catalogue';

// ── Fixture: minimal Firestore-format document (generic structure) ────────────
const FIRESTORE_SINGLE_DOC = {
  name: 'projects/ellines-haven-web/databases/(default)/documents/site_data/books_catalogue',
  fields: {
    books: {
      arrayValue: {
        values: [
          {
            mapValue: {
              fields: {
                id: { stringValue: 'book-001' },
                title: { stringValue: 'Marriage Is a Scam' },
                author: { stringValue: 'Elijah Mwangi M' },
                status: { stringValue: 'published' },
                genre: { stringValue: 'Contemporary Fiction' },
                price: { integerValue: '499' },
                rating: { doubleValue: 4.7 },
                wordCount: { integerValue: '62000' },
                active: { booleanValue: true },
                featured: { booleanValue: true },
                isNew: { booleanValue: false },
              },
            },
          },
          {
            mapValue: {
              fields: {
                id: { stringValue: 'book-002' },
                title: { stringValue: 'The Nairobi Chronicles' },
                author: { stringValue: 'Amina Hassan' },
                status: { stringValue: 'draft' },
                genre: { stringValue: 'Mystery' },
                price: { integerValue: '350' },
                active: { booleanValue: false },
                featured: { booleanValue: false },
                isNew: { booleanValue: true },
              },
            },
          },
        ],
      },
    },
    updatedAt: { timestampValue: '2026-09-01T10:00:00Z' },
  },
  createTime: '2026-01-01T00:00:00Z',
  updateTime: '2026-09-01T10:00:00Z',
};

const FIRESTORE_COLLECTION = {
  documents: [
    {
      name: 'projects/ellines-haven-web/databases/(default)/documents/site_data/about_content',
      fields: {
        heroTagline: { stringValue: 'A home for original African literature.' },
        updatedAt: { timestampValue: '2026-06-28T16:29:53Z' },
      },
      createTime: '2026-01-01T00:00:00Z',
      updateTime: '2026-06-28T16:29:53Z',
    },
  ],
};

// ============================================================================
// 1. SSRF policy — Haven Firestore endpoint must pass (static, no network)
// ============================================================================

describe('SSRF policy: Haven Firestore endpoint', () => {
  it('accepts the Haven books_catalogue endpoint', () => {
    const result = isSafeEgressTarget(HAVEN_BOOKS_ENDPOINT);
    expect(result).toEqual({ safe: true });
  });

  it('accepts the Haven site_data collection endpoint', () => {
    const collectionUrl =
      'https://firestore.googleapis.com/v1/projects/ellines-haven-web/databases/(default)/documents/site_data';
    expect(isSafeEgressTarget(collectionUrl)).toEqual({ safe: true });
  });

  it('blocks a plain http:// version of the same URL', () => {
    const httpUrl = HAVEN_BOOKS_ENDPOINT.replace('https://', 'http://');
    const result = isSafeEgressTarget(httpUrl);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/https/i);
  });

  it('blocks localhost', () => {
    expect(isSafeEgressTarget('https://localhost/api').safe).toBe(false);
  });

  it('blocks 169.254.169.254 (cloud metadata)', () => {
    expect(isSafeEgressTarget('https://169.254.169.254/latest/meta-data/').safe).toBe(false);
  });
});

// ============================================================================
// 2. isFirestoreResponse — structural detection (no system-specific knowledge)
// ============================================================================

describe('isFirestoreResponse', () => {
  it('detects a Firestore single document', () => {
    expect(isFirestoreResponse(FIRESTORE_SINGLE_DOC)).toBe(true);
  });

  it('detects a Firestore collection list response', () => {
    expect(isFirestoreResponse(FIRESTORE_COLLECTION)).toBe(true);
  });

  it('returns false for a plain REST JSON response', () => {
    expect(
      isFirestoreResponse({
        healthScore: 80,
        connectedSystems: 3,
        briefHighlight: 'OK',
        timeline: [],
      }),
    ).toBe(false);
  });

  it('returns false for null', () => {
    expect(isFirestoreResponse(null)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isFirestoreResponse([])).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isFirestoreResponse('hello')).toBe(false);
  });

  it('requires name to start with "projects/" for single-doc detection', () => {
    expect(isFirestoreResponse({ name: 'not-projects/x', fields: {} })).toBe(false);
    expect(isFirestoreResponse({ name: 'projects/x', fields: {} })).toBe(true);
  });
});

// ============================================================================
// 3. unpackFirestoreValue — every typed-value kind
// ============================================================================

describe('unpackFirestoreValue', () => {
  it('unpacks stringValue', () => {
    expect(unpackFirestoreValue({ stringValue: 'hello' })).toBe('hello');
  });

  it('unpacks integerValue (arrives as string in Firestore wire format)', () => {
    expect(unpackFirestoreValue({ integerValue: '42' })).toBe(42);
  });

  it('unpacks doubleValue', () => {
    expect(unpackFirestoreValue({ doubleValue: 3.14 })).toBeCloseTo(3.14);
  });

  it('unpacks booleanValue true', () => {
    expect(unpackFirestoreValue({ booleanValue: true })).toBe(true);
  });

  it('unpacks booleanValue false', () => {
    expect(unpackFirestoreValue({ booleanValue: false })).toBe(false);
  });

  it('unpacks nullValue', () => {
    expect(unpackFirestoreValue({ nullValue: null })).toBeNull();
  });

  it('unpacks timestampValue as ISO string', () => {
    expect(unpackFirestoreValue({ timestampValue: '2026-09-01T10:00:00Z' })).toBe(
      '2026-09-01T10:00:00Z',
    );
  });

  it('unpacks arrayValue recursively', () => {
    const result = unpackFirestoreValue({
      arrayValue: {
        values: [{ stringValue: 'a' }, { integerValue: '2' }],
      },
    });
    expect(result).toEqual(['a', 2]);
  });

  it('unpacks empty arrayValue', () => {
    expect(unpackFirestoreValue({ arrayValue: {} })).toEqual([]);
  });

  it('unpacks mapValue recursively', () => {
    const result = unpackFirestoreValue({
      mapValue: {
        fields: {
          name: { stringValue: 'test' },
          count: { integerValue: '7' },
        },
      },
    });
    expect(result).toEqual({ name: 'test', count: 7 });
  });

  it('passes through plain (non-Firestore-typed) values unchanged', () => {
    expect(unpackFirestoreValue('plain string')).toBe('plain string');
    expect(unpackFirestoreValue(42)).toBe(42);
    expect(unpackFirestoreValue(null)).toBeNull();
  });
});

// ============================================================================
// 4. normalizeFirestoreResponse — single doc and collection
// ============================================================================

describe('normalizeFirestoreResponse', () => {
  it('unpacks a single document: metadata fields present', () => {
    const result = normalizeFirestoreResponse(FIRESTORE_SINGLE_DOC) as Record<string, unknown>;
    expect(result._firestoreName).toBe(
      'projects/ellines-haven-web/databases/(default)/documents/site_data/books_catalogue',
    );
    expect(result._firestoreUpdatedAt).toBe('2026-09-01T10:00:00Z');
  });

  it('unpacks a single document: domain fields are plain JS values', () => {
    const result = normalizeFirestoreResponse(FIRESTORE_SINGLE_DOC) as Record<string, unknown>;
    expect(result.updatedAt).toBe('2026-09-01T10:00:00Z');
    expect(Array.isArray(result.books)).toBe(true);
  });

  it('fully unpacks nested arrays of maps (books)', () => {
    const result = normalizeFirestoreResponse(FIRESTORE_SINGLE_DOC) as Record<string, unknown>;
    const books = result.books as Record<string, unknown>[];
    expect(books).toHaveLength(2);
    // All typed values unwrapped to plain JS
    expect(books[0]).toMatchObject({
      id: 'book-001',
      title: 'Marriage Is a Scam',
      author: 'Elijah Mwangi M',
      status: 'published',
      price: 499,       // integerValue '499' → number 499
      rating: 4.7,      // doubleValue 4.7 → number 4.7
      wordCount: 62000, // integerValue '62000' → number 62000
      active: true,     // booleanValue → boolean
      featured: true,
    });
    expect(books[1]).toMatchObject({
      id: 'book-002',
      title: 'The Nairobi Chronicles',
      status: 'draft',
      active: false,
    });
  });

  it('unpacks a collection list response', () => {
    const result = normalizeFirestoreResponse(FIRESTORE_COLLECTION) as Record<string, unknown>;
    const docs = (result as { documents: Record<string, unknown>[] }).documents;
    expect(Array.isArray(docs)).toBe(true);
    expect(docs).toHaveLength(1);
    expect(docs[0].heroTagline).toBe('A home for original African literature.');
    expect(docs[0]._firestoreName).toContain('about_content');
  });

  it('returns an empty object for non-Firestore input', () => {
    expect(normalizeFirestoreResponse(null)).toEqual({});
    expect(normalizeFirestoreResponse('not an object')).toEqual({});
  });
});

// ============================================================================
// 5. End-to-end: raw Firestore JSON → normalizeEnterprisePayload (generic)
//
// This is the full pipeline EIP runs for any REST connector that returns
// Firestore-format JSON. EIP applies no Haven-specific logic — it uses the
// same normalizeEnterprisePayload it uses for every other connector.
// ============================================================================

describe('end-to-end: Firestore REST → generic normalizeEnterprisePayload', () => {
  it('produces a valid (if sparse) EIP enterprise payload from the raw Firestore fixture', () => {
    // Step 1: detect Firestore format
    expect(isFirestoreResponse(FIRESTORE_SINGLE_DOC)).toBe(true);

    // Step 2: unpack typed values to plain JS
    const plain = normalizeFirestoreResponse(FIRESTORE_SINGLE_DOC) as Record<string, unknown>;
    expect(typeof plain._firestoreName).toBe('string');
    expect(Array.isArray(plain.books)).toBe(true);

    // Step 3: normalizeEnterprisePayload — generic field inference
    // The Firestore document fields don't match EIP's expected field names
    // (healthScore, connectedSystems, etc.) directly, so the payload will have
    // zero values for numeric fields and inferred timeline from whatever is available.
    // This is the correct behaviour — EIP does not pretend to understand Haven's
    // domain; it just reports what it can infer generically.
    const payload = normalizeEnterprisePayload(plain);

    // Shape integrity
    expect(typeof payload.healthScore).toBe('number');
    expect(typeof payload.connectedSystems).toBe('number');
    expect(typeof payload.openAlerts).toBe('number');
    expect(typeof payload.openDecisions).toBe('number');
    expect(typeof payload.briefHighlight).toBe('string');
    expect(Array.isArray(payload.timeline)).toBe(true);

    // Values are within valid range
    expect(payload.healthScore).toBeGreaterThanOrEqual(0);
    expect(payload.healthScore).toBeLessThanOrEqual(100);

    // UEM model is inferred
    expect(payload.model).not.toBeNull();
  });

  it('handles a Firestore collection list as plainly as any other REST response', () => {
    const plain = normalizeFirestoreResponse(FIRESTORE_COLLECTION) as Record<string, unknown>;
    const payload = normalizeEnterprisePayload(plain);
    expect(typeof payload.briefHighlight).toBe('string');
    expect(Array.isArray(payload.timeline)).toBe(true);
  });

  it('pipeline is idempotent for non-Firestore JSON (plain REST responses unchanged)', () => {
    // A plain REST response that is NOT Firestore-format goes straight to
    // normalizeEnterprisePayload without any unpacking.
    const plain = {
      healthScore: 72,
      connectedSystems: 5,
      openAlerts: 2,
      briefHighlight: 'All systems nominal.',
      timeline: [{ title: 'Deploy', detail: 'v1.4.2 deployed' }],
    };
    expect(isFirestoreResponse(plain)).toBe(false);
    const payload = normalizeEnterprisePayload(plain);
    expect(payload.healthScore).toBe(72);
    expect(payload.connectedSystems).toBe(5);
    expect(payload.briefHighlight).toBe('All systems nominal.');
  });
});

// ============================================================================
// 6. Live integration (network) — skipped unless HAVEN_LIVE_TEST=1
//
// Connects to the real Haven Firestore REST endpoint, unpacks the Firestore
// typed values generically, and feeds the result through normalizeEnterprisePayload.
// No Haven-specific mapping is applied — EIP does not know it is Haven.
// ============================================================================

const RUN_LIVE = process.env.HAVEN_LIVE_TEST === '1';

(RUN_LIVE ? describe : describe.skip)(
  'LIVE: Haven Firestore endpoint — generic pipeline (requires network)',
  () => {
    it(
      'fetches books_catalogue, unpacks Firestore format, produces valid EIP payload',
      async () => {
        const res = await fetch(HAVEN_BOOKS_ENDPOINT, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        expect(res.ok).toBe(true);

        const raw: unknown = await res.json();

        // Step 1: confirm Firestore format detected
        expect(isFirestoreResponse(raw)).toBe(true);

        // Step 2: unpack to plain JS — no Haven knowledge needed
        const plain = normalizeFirestoreResponse(raw) as Record<string, unknown>;
        expect(typeof plain._firestoreName).toBe('string');
        expect((plain._firestoreName as string)).toContain('ellines-haven-web');

        // Step 3: generic EIP normalisation
        const payload = normalizeEnterprisePayload(plain);

        // Basic shape integrity
        expect(typeof payload.healthScore).toBe('number');
        expect(payload.healthScore).toBeGreaterThanOrEqual(0);
        expect(payload.healthScore).toBeLessThanOrEqual(100);
        expect(Array.isArray(payload.timeline)).toBe(true);
        expect(typeof payload.briefHighlight).toBe('string');

        // Log for the P1 report
        console.log('=== LIVE Haven → generic EIP payload ===');
        console.log(JSON.stringify({
          healthScore: payload.healthScore,
          connectedSystems: payload.connectedSystems,
          openAlerts: payload.openAlerts,
          openDecisions: payload.openDecisions,
          briefHighlight: payload.briefHighlight,
          timelineEntries: payload.timeline.length,
          _firestoreName: plain._firestoreName,
        }, null, 2));
      },
      15_000,
    );
  },
);
