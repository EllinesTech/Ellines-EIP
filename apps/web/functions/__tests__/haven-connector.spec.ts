/**
 * P1 — Ellines Haven Connector Experiment (corrected)
 *
 * Demonstrates that EIP can connect to any business system's REST API
 * without EIP containing any knowledge of that system's domain model.
 *
 * The specific target used for the P1 experiment is the Ellines Haven
 * havenCatalogueApi Cloud Function, which is Haven's own business API
 * (not a raw database endpoint):
 *
 *   https://us-central1-ellines-haven-web.cloudfunctions.net/havenCatalogueApi
 *
 * A Super Admin configures this URL in the connector install wizard.
 * EIP calls it through the SSRF-safe egress policy, receives the JSON,
 * and normalizes it generically — no Haven-specific code in EIP.
 *
 * Response shape from havenCatalogueApi:
 *   { "success": true, "api": "ellines-haven-catalogue", "business": "Ellines Haven",
 *     "currency": "KES", "count": 15,
 *     "books": [{ "id": "1", "title": "Marriage Is a Scam", "author": "...", "price": 350,
 *                 "rating": 4.8, "status": "complete", ... }, ...] }
 *
 * The generic normalizer maps:
 *   count  → connectedSystems (= 15)
 *   business + count → briefHighlight ("Ellines Haven: 15 records synced.")
 *   books[].title + books[].author → timeline entries
 *
 * Tests:
 *  1. SSRF policy accepts the havenCatalogueApi endpoint
 *  2. SSRF policy accepts the Firestore endpoint (also tested for completeness)
 *  3. isFirestoreResponse — detects/rejects correctly
 *  4. unpackFirestoreValue — all typed-value kinds
 *  5. normalizeFirestoreResponse — single doc and collection
 *  6. normalizeEnterprisePayload with Haven Cloud Function JSON shape
 *  7. normalizeEnterprisePayload with a generic EIP-field response (regression)
 *  8. Live integration (HAVEN_LIVE_TEST=1) — real HTTP to havenCatalogueApi
 */

import {
  isFirestoreResponse,
  unpackFirestoreValue,
  unpackFirestoreFields,
  normalizeFirestoreResponse,
} from '../shared/firestore-normalizer';
import { isSafeEgressTarget } from '../shared/egress';
import { normalizeEnterprisePayload } from '../shared/connectors';

// ── Target endpoints ──────────────────────────────────────────────────────────
// Primary: Haven's own Cloud Function API (the business API boundary)
const HAVEN_API_ENDPOINT =
  'https://us-central1-ellines-haven-web.cloudfunctions.net/havenCatalogueApi';

// Secondary: Firestore REST (tested for SSRF completeness, not primary target)
const HAVEN_FIRESTORE_ENDPOINT =
  'https://firestore.googleapis.com/v1/projects/ellines-haven-web/databases/(default)/documents/site_data/books_catalogue';

// ── Fixture: Haven Cloud Function response shape ──────────────────────────────
// Matches the actual live response from havenCatalogueApi.
const HAVEN_API_RESPONSE = {
  success: true,
  api: 'ellines-haven-catalogue',
  version: '1',
  business: 'Ellines Haven',
  currency: 'KES',
  count: 15,
  books: [
    {
      id: '1',
      title: 'Marriage Is a Scam',
      subtitle: 'When Love Is Not Enough',
      author: 'Elijah Mwangi M',
      genre: 'Relationship Drama',
      status: 'complete',
      price: 350,
      rating: 4.8,
      featured: true,
      freeFirstChapter: true,
    },
    {
      id: '2',
      title: 'Pain',
      author: 'Elijah Mwangi M',
      genre: 'Drama',
      status: 'coming-soon',
      price: 320,
      rating: 4.8,
      featured: true,
    },
    {
      id: '3',
      title: 'Echoes of the Savanna',
      author: 'Elijah Mwangi M',
      genre: 'Historical',
      status: 'complete',
      price: 250,
      rating: 4.6,
      featured: false,
    },
  ],
};

// ── Fixture: minimal Firestore-format document ────────────────────────────────
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
                price: { integerValue: '499' },
                rating: { doubleValue: 4.7 },
                active: { booleanValue: true },
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
// 1. SSRF policy
// ============================================================================

describe('SSRF policy', () => {
  it('accepts the Haven havenCatalogueApi Cloud Function endpoint', () => {
    expect(isSafeEgressTarget(HAVEN_API_ENDPOINT)).toEqual({ safe: true });
  });

  it('accepts the Haven Firestore REST endpoint', () => {
    expect(isSafeEgressTarget(HAVEN_FIRESTORE_ENDPOINT)).toEqual({ safe: true });
  });

  it('blocks http:// (non-HTTPS)', () => {
    const result = isSafeEgressTarget(HAVEN_API_ENDPOINT.replace('https://', 'http://'));
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
// 2. isFirestoreResponse detection
// ============================================================================

describe('isFirestoreResponse', () => {
  it('returns false for Haven Cloud Function response (plain JSON)', () => {
    // havenCatalogueApi returns plain JSON — NOT Firestore format
    expect(isFirestoreResponse(HAVEN_API_RESPONSE)).toBe(false);
  });

  it('detects a Firestore single document', () => {
    expect(isFirestoreResponse(FIRESTORE_SINGLE_DOC)).toBe(true);
  });

  it('detects a Firestore collection list response', () => {
    expect(isFirestoreResponse(FIRESTORE_COLLECTION)).toBe(true);
  });

  it('returns false for null / array / string', () => {
    expect(isFirestoreResponse(null)).toBe(false);
    expect(isFirestoreResponse([])).toBe(false);
    expect(isFirestoreResponse('hello')).toBe(false);
  });

  it('requires name to start with "projects/" for single-doc detection', () => {
    expect(isFirestoreResponse({ name: 'not-projects/x', fields: {} })).toBe(false);
    expect(isFirestoreResponse({ name: 'projects/x', fields: {} })).toBe(true);
  });
});

// ============================================================================
// 3. unpackFirestoreValue
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

  it('unpacks booleanValue', () => {
    expect(unpackFirestoreValue({ booleanValue: true })).toBe(true);
    expect(unpackFirestoreValue({ booleanValue: false })).toBe(false);
  });

  it('unpacks nullValue', () => {
    expect(unpackFirestoreValue({ nullValue: null })).toBeNull();
  });

  it('unpacks timestampValue as ISO string', () => {
    expect(unpackFirestoreValue({ timestampValue: '2026-09-01T10:00:00Z' })).toBe('2026-09-01T10:00:00Z');
  });

  it('unpacks arrayValue recursively', () => {
    expect(unpackFirestoreValue({
      arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '2' }] },
    })).toEqual(['a', 2]);
  });

  it('unpacks mapValue recursively', () => {
    expect(unpackFirestoreValue({
      mapValue: { fields: { name: { stringValue: 'test' }, count: { integerValue: '7' } } },
    })).toEqual({ name: 'test', count: 7 });
  });

  it('passes through plain values unchanged', () => {
    expect(unpackFirestoreValue('plain')).toBe('plain');
    expect(unpackFirestoreValue(42)).toBe(42);
    expect(unpackFirestoreValue(null)).toBeNull();
  });
});

// ============================================================================
// 4. normalizeFirestoreResponse
// ============================================================================

describe('normalizeFirestoreResponse', () => {
  it('unpacks a single document to plain fields', () => {
    const result = normalizeFirestoreResponse(FIRESTORE_SINGLE_DOC) as Record<string, unknown>;
    expect(result._firestoreName).toBe(FIRESTORE_SINGLE_DOC.name);
    expect(result._firestoreUpdatedAt).toBe('2026-09-01T10:00:00Z');
    expect(Array.isArray(result.books)).toBe(true);
    const books = result.books as Record<string, unknown>[];
    expect(books[0]).toMatchObject({ id: 'book-001', title: 'Marriage Is a Scam', price: 499 });
  });

  it('unpacks a collection list response', () => {
    const result = normalizeFirestoreResponse(FIRESTORE_COLLECTION) as Record<string, unknown>;
    const docs = (result as { documents: Record<string, unknown>[] }).documents;
    expect(docs[0].heroTagline).toBe('A home for original African literature.');
  });

  it('returns empty object for non-Firestore input', () => {
    expect(normalizeFirestoreResponse(null)).toEqual({});
  });
});

// ============================================================================
// 5. normalizeEnterprisePayload with Haven Cloud Function JSON (the real P1 case)
//
// havenCatalogueApi returns {"success":true,"business":"Ellines Haven","count":15,
// "books":[{title,author,genre,status,...},...]}
// The generic normalizer should:
//   count  → connectedSystems = 15
//   business + count → briefHighlight contains "Ellines Haven" and "15"
//   books[].title + books[].author/genre → timeline entries (up to 12)
// ============================================================================

describe('normalizeEnterprisePayload — Haven Cloud Function JSON shape', () => {
  let payload: ReturnType<typeof normalizeEnterprisePayload>;

  beforeEach(() => {
    payload = normalizeEnterprisePayload(HAVEN_API_RESPONSE);
  });

  it('maps count to connectedSystems', () => {
    // HAVEN_API_RESPONSE has count: 15 at the top level — that maps to connectedSystems
    expect(payload.connectedSystems).toBe(15);
  });

  it('synthesises briefHighlight from business + count', () => {
    expect(payload.briefHighlight).toContain('Ellines Haven');
    expect(payload.briefHighlight).toContain('15');
  });

  it('builds timeline from books array (books[] used since no timeline/events field)', () => {
    expect(payload.timeline.length).toBe(3);
    expect(payload.timeline[0].title).toBe('Marriage Is a Scam');
    // detail prefers author over status
    expect(payload.timeline[0].detail).toContain('Elijah Mwangi M');
  });

  it('healthScore is 0 (Haven API does not expose a health metric)', () => {
    // Correct — Haven has no healthScore field; EIP should not invent one
    expect(payload.healthScore).toBe(0);
  });

  it('model is inferred (not null)', () => {
    expect(payload.model).not.toBeNull();
  });

  it('all required shape fields are present', () => {
    expect(typeof payload.healthScore).toBe('number');
    expect(typeof payload.connectedSystems).toBe('number');
    expect(typeof payload.openAlerts).toBe('number');
    expect(typeof payload.openDecisions).toBe('number');
    expect(typeof payload.briefHighlight).toBe('string');
    expect(Array.isArray(payload.timeline)).toBe(true);
  });
});

// ============================================================================
// 6. normalizeEnterprisePayload — regression: standard EIP-field JSON still works
// ============================================================================

describe('normalizeEnterprisePayload — standard EIP field names (regression)', () => {
  it('maps EIP-native fields exactly', () => {
    const payload = normalizeEnterprisePayload({
      healthScore: 82,
      connectedSystems: 5,
      openAlerts: 3,
      openDecisions: 1,
      briefHighlight: 'All systems nominal.',
      timeline: [{ title: 'Deploy', detail: 'v1.4.2 deployed' }],
    });
    expect(payload.healthScore).toBe(82);
    expect(payload.connectedSystems).toBe(5);
    expect(payload.openAlerts).toBe(3);
    expect(payload.openDecisions).toBe(1);
    expect(payload.briefHighlight).toBe('All systems nominal.');
    expect(payload.timeline[0].title).toBe('Deploy');
  });
});

// ============================================================================
// 7. Live integration (HAVEN_LIVE_TEST=1) — real HTTP to havenCatalogueApi
// ============================================================================

const RUN_LIVE = process.env.HAVEN_LIVE_TEST === '1';

(RUN_LIVE ? describe : describe.skip)(
  'LIVE: havenCatalogueApi — generic pipeline (requires network)',
  () => {
    it(
      'fetches havenCatalogueApi, NOT Firestore format, normalizes generically',
      async () => {
        const res = await fetch(HAVEN_API_ENDPOINT, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        expect(res.ok).toBe(true);

        const raw: unknown = await res.json();

        // havenCatalogueApi returns plain JSON — NOT Firestore format
        expect(isFirestoreResponse(raw)).toBe(false);

        const payload = normalizeEnterprisePayload(raw);

        // Basic integrity checks
        expect(typeof payload.healthScore).toBe('number');
        expect(payload.connectedSystems).toBeGreaterThan(0); // count=15 maps to connectedSystems
        expect(Array.isArray(payload.timeline)).toBe(true);
        expect(payload.timeline.length).toBeGreaterThan(0); // books → timeline
        expect(typeof payload.briefHighlight).toBe('string');
        expect(payload.briefHighlight).toContain('Ellines Haven'); // business field used

        console.log('=== LIVE havenCatalogueApi → generic EIP payload ===');
        console.log(JSON.stringify({
          healthScore: payload.healthScore,
          connectedSystems: payload.connectedSystems,
          openAlerts: payload.openAlerts,
          openDecisions: payload.openDecisions,
          briefHighlight: payload.briefHighlight,
          timelineEntries: payload.timeline.length,
          firstTitle: payload.timeline[0]?.title,
        }, null, 2));
      },
      15_000,
    );
  },
);