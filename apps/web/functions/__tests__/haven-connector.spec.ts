/**
 * P1 — Ellines Haven Connector Experiment
 *
 * Tests covering:
 *  1. SSRF policy accepts the Haven Firestore endpoint (static validation)
 *  2. Firestore REST response detection (isFirestoreResponse)
 *  3. Generic Firestore value unpacking (unpackFirestoreValue / unpackFirestoreFields)
 *  4. Top-level normalizeFirestoreResponse — single document and collection
 *  5. Haven books_catalogue → EIP enterprise payload mapping
 *  6. End-to-end: raw Haven API shape → normalizeEnterprisePayload output
 *
 * Live integration (actual HTTP to firestore.googleapis.com) is separated into
 * a describe block that is skipped by default (HAVEN_LIVE_TEST=1 to enable).
 * All other tests run in the standard Jest environment with no network access.
 */

import {
  isFirestoreResponse,
  unpackFirestoreValue,
  unpackFirestoreFields,
  normalizeFirestoreResponse,
  mapHavenBooksCatalogueToEipPayload,
} from '../shared/firestore-normalizer';
import { isSafeEgressTarget } from '../shared/egress';
import { normalizeEnterprisePayload } from '../shared/connectors';

// ── Real Haven endpoint under test ──────────────────────────────────────────
const HAVEN_BOOKS_ENDPOINT =
  'https://firestore.googleapis.com/v1/projects/ellines-haven-web/databases/(default)/documents/site_data/books_catalogue';

// ── Fixture: minimal Firestore typed-value document ──────────────────────────
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
          {
            mapValue: {
              fields: {
                id: { stringValue: 'book-003' },
                title: { stringValue: 'Savanna Dreams' },
                author: { stringValue: 'Kofi Asante' },
                status: { stringValue: 'coming_soon' },
                genre: { stringValue: 'Romance' },
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
// 1. SSRF policy — Haven endpoint must pass (static, no network)
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
    const result = isSafeEgressTarget('https://localhost/api');
    expect(result.safe).toBe(false);
  });

  it('blocks 169.254.169.254 (cloud metadata)', () => {
    const result = isSafeEgressTarget('https://169.254.169.254/latest/meta-data/');
    expect(result.safe).toBe(false);
  });
});

// ============================================================================
// 2. isFirestoreResponse detection
// ============================================================================

describe('isFirestoreResponse', () => {
  it('detects a Firestore single document', () => {
    expect(isFirestoreResponse(FIRESTORE_SINGLE_DOC)).toBe(true);
  });

  it('detects a Firestore collection list response', () => {
    expect(isFirestoreResponse(FIRESTORE_COLLECTION)).toBe(true);
  });

  it('returns false for a plain EIP-style JSON response', () => {
    expect(
      isFirestoreResponse({
        healthScore: 80,
        connectedSystems: 3,
        briefHighlight: 'test',
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
});

// ============================================================================
// 3. unpackFirestoreValue — individual typed value unwrapping
// ============================================================================

describe('unpackFirestoreValue', () => {
  it('unpacks stringValue', () => {
    expect(unpackFirestoreValue({ stringValue: 'hello' })).toBe('hello');
  });

  it('unpacks integerValue (arrives as string)', () => {
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

  it('unpacks timestampValue', () => {
    expect(unpackFirestoreValue({ timestampValue: '2026-09-01T10:00:00Z' })).toBe(
      '2026-09-01T10:00:00Z',
    );
  });

  it('unpacks arrayValue', () => {
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

  it('unpacks mapValue', () => {
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

  it('handles plain (non-Firestore-typed) value without crashing', () => {
    expect(unpackFirestoreValue('plain string')).toBe('plain string');
    expect(unpackFirestoreValue(42)).toBe(42);
    expect(unpackFirestoreValue(null)).toBeNull();
  });
});

// ============================================================================
// 4. normalizeFirestoreResponse — document and collection
// ============================================================================

describe('normalizeFirestoreResponse', () => {
  it('unpacks a single document into plain fields', () => {
    const result = normalizeFirestoreResponse(FIRESTORE_SINGLE_DOC) as Record<string, unknown>;

    expect(result._firestoreName).toBe(
      'projects/ellines-haven-web/databases/(default)/documents/site_data/books_catalogue',
    );
    expect(result._firestoreUpdatedAt).toBe('2026-09-01T10:00:00Z');
    expect(result.updatedAt).toBe('2026-09-01T10:00:00Z');
    expect(Array.isArray(result.books)).toBe(true);
  });

  it('fully unpacks the nested books array', () => {
    const result = normalizeFirestoreResponse(FIRESTORE_SINGLE_DOC) as Record<string, unknown>;
    const books = result.books as Record<string, unknown>[];
    expect(books).toHaveLength(3);
    expect(books[0]).toMatchObject({
      id: 'book-001',
      title: 'Marriage Is a Scam',
      author: 'Elijah Mwangi M',
      status: 'published',
      price: 499,
      rating: 4.7,
      wordCount: 62000,
      active: true,
      featured: true,
    });
    expect(books[1]).toMatchObject({ title: 'The Nairobi Chronicles', status: 'draft' });
    expect(books[2]).toMatchObject({ title: 'Savanna Dreams', status: 'coming_soon' });
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
// 5. mapHavenBooksCatalogueToEipPayload — Haven books → EIP fields
// ============================================================================

describe('mapHavenBooksCatalogueToEipPayload', () => {
  // Unpack the fixture into the plain-object form that sync.ts produces
  const plain = normalizeFirestoreResponse(FIRESTORE_SINGLE_DOC) as Record<string, unknown>;

  it('returns a systemName of "Ellines Haven"', () => {
    const payload = mapHavenBooksCatalogueToEipPayload(plain);
    expect(payload.systemName).toBe('Ellines Haven');
  });

  it('counts only published/active books as connectedSystems', () => {
    // Fixture: 1 published (book-001), 2 not (book-002 draft, book-003 coming_soon)
    const payload = mapHavenBooksCatalogueToEipPayload(plain);
    expect(payload.connectedSystems).toBe(1);
  });

  it('counts draft/coming_soon books as openAlerts', () => {
    const payload = mapHavenBooksCatalogueToEipPayload(plain);
    expect(payload.openAlerts).toBe(2);
  });

  it('counts featured books as openDecisions', () => {
    const payload = mapHavenBooksCatalogueToEipPayload(plain);
    expect(payload.openDecisions).toBe(1); // only book-001 is featured
  });

  it('derives a healthScore of 33% (1 of 3 published)', () => {
    const payload = mapHavenBooksCatalogueToEipPayload(plain);
    expect(payload.healthScore).toBe(33);
  });

  it('produces a timeline entry for each book', () => {
    const payload = mapHavenBooksCatalogueToEipPayload(plain);
    const timeline = payload.timeline as { title: string; detail: string }[];
    expect(timeline).toHaveLength(3);
    expect(timeline[0].title).toBe('Marriage Is a Scam');
    expect(timeline[0].detail).toContain('Elijah Mwangi M');
    expect(timeline[0].detail).toContain('Published');
    expect(timeline[1].title).toBe('The Nairobi Chronicles');
    expect(timeline[1].detail).toContain('Draft');
    expect(timeline[2].detail).toContain('Coming soon');
  });

  it('generates a human-readable briefHighlight', () => {
    const payload = mapHavenBooksCatalogueToEipPayload(plain);
    expect(typeof payload.briefHighlight).toBe('string');
    expect(payload.briefHighlight as string).toContain('Ellines Haven');
    expect(payload.briefHighlight as string).toContain('1 of 3 books published');
  });

  it('handles an empty books array gracefully', () => {
    const payload = mapHavenBooksCatalogueToEipPayload({ books: [] });
    expect(payload.healthScore).toBe(0);
    expect(payload.connectedSystems).toBe(0);
    expect(payload.openAlerts).toBe(0);
    expect((payload.timeline as unknown[]).length).toBe(0);
  });

  it('handles missing books field gracefully', () => {
    const payload = mapHavenBooksCatalogueToEipPayload({});
    expect(payload.healthScore).toBe(0);
    expect(payload.connectedSystems).toBe(0);
  });
});

// ============================================================================
// 6. End-to-end: raw Haven API shape → normalizeEnterprisePayload
// ============================================================================

describe('end-to-end: Haven Firestore → normalizeEnterprisePayload', () => {
  it('produces a valid EIP enterprise payload from the full raw fixture', () => {
    // Simulate what proxyFetch does in sync.ts:
    //   1. Parse JSON
    //   2. isFirestoreResponse → true
    //   3. normalizeFirestoreResponse → plain doc
    //   4. _firestoreName ends with /books_catalogue → mapHavenBooksCatalogueToEipPayload
    //   5. normalizeEnterprisePayload picks up the result
    const raw = FIRESTORE_SINGLE_DOC;
    expect(isFirestoreResponse(raw)).toBe(true);

    const unpacked = normalizeFirestoreResponse(raw) as Record<string, unknown>;
    expect(
      (unpacked._firestoreName as string).endsWith('/books_catalogue'),
    ).toBe(true);

    const havenPayload = mapHavenBooksCatalogueToEipPayload(unpacked);
    const eipPayload = normalizeEnterprisePayload(havenPayload);

    expect(eipPayload.healthScore).toBe(33);
    expect(eipPayload.connectedSystems).toBe(1);
    expect(eipPayload.openAlerts).toBe(2);
    expect(eipPayload.openDecisions).toBe(1);
    expect(eipPayload.briefHighlight).toContain('Ellines Haven');
    expect(eipPayload.timeline.length).toBeGreaterThan(0);
    expect(eipPayload.timeline[0].title).toBe('Marriage Is a Scam');
    // UEM model should be inferred
    expect(eipPayload.model).not.toBeNull();
  });

  it('pipeline produces non-zero values even for all-draft fixture', () => {
    const allDraft = {
      ...FIRESTORE_SINGLE_DOC,
      fields: {
        ...FIRESTORE_SINGLE_DOC.fields,
        books: {
          arrayValue: {
            values: [
              {
                mapValue: {
                  fields: {
                    id: { stringValue: 'b1' },
                    title: { stringValue: 'Unpublished' },
                    author: { stringValue: 'Author A' },
                    status: { stringValue: 'draft' },
                    active: { booleanValue: false },
                    featured: { booleanValue: false },
                  },
                },
              },
            ],
          },
        },
      },
    };

    const unpacked = normalizeFirestoreResponse(allDraft) as Record<string, unknown>;
    const havenPayload = mapHavenBooksCatalogueToEipPayload(unpacked);
    const eipPayload = normalizeEnterprisePayload(havenPayload);

    expect(eipPayload.healthScore).toBe(0);
    expect(eipPayload.openAlerts).toBe(1);
    expect(eipPayload.briefHighlight).toContain('Ellines Haven');
  });
});

// ============================================================================
// 7. Live integration (network) — skipped unless HAVEN_LIVE_TEST=1
// ============================================================================

const RUN_LIVE = process.env.HAVEN_LIVE_TEST === '1';

(RUN_LIVE ? describe : describe.skip)(
  'LIVE: Haven Firestore endpoint (requires network)',
  () => {
    it(
      'fetches books_catalogue and produces a valid EIP payload',
      async () => {
        const res = await fetch(HAVEN_BOOKS_ENDPOINT, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        expect(res.ok).toBe(true);

        const raw: unknown = await res.json();
        expect(isFirestoreResponse(raw)).toBe(true);

        const unpacked = normalizeFirestoreResponse(raw) as Record<string, unknown>;
        expect(typeof unpacked._firestoreName).toBe('string');

        const havenPayload = mapHavenBooksCatalogueToEipPayload(unpacked);
        const eipPayload = normalizeEnterprisePayload(havenPayload);

        // Basic integrity: must have at least 1 published book (Haven is live)
        expect(eipPayload.connectedSystems).toBeGreaterThan(0);
        expect(eipPayload.timeline.length).toBeGreaterThan(0);
        expect(typeof eipPayload.briefHighlight).toBe('string');
        expect(eipPayload.briefHighlight).toContain('Ellines Haven');

        // Log the actual shape for the P1 report
        console.log('=== LIVE Haven EIP payload ===');
        console.log(JSON.stringify(eipPayload, null, 2));
      },
      15_000, // 15s timeout for live HTTP
    );
  },
);
