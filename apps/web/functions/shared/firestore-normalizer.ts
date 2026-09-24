/**
 * Ellines EIP — Generic Firestore REST API response normalizer
 *
 * The Firestore REST API wraps every field value in a typed envelope:
 *   { "stringValue": "hello" }
 *   { "integerValue": "42" }          ← note: numbers come as strings
 *   { "doubleValue": 3.14 }
 *   { "booleanValue": true }
 *   { "timestampValue": "2026-06-01T00:00:00Z" }
 *   { "arrayValue": { "values": [...] } }
 *   { "mapValue": { "fields": { ... } } }
 *   { "nullValue": null }
 *   { "bytesValue": "<base64>" }       ← left as-is
 *
 * This module provides:
 *
 *  isFirestoreDocument(raw)         — detects a Firestore REST document or
 *                                     collection response by its shape.
 *  unpackFirestoreValue(val)        — recursively unwraps a single typed value.
 *  unpackFirestoreFields(fields)    — unwraps a `fields` map into a plain object.
 *  normalizeFirestoreResponse(raw)  — top-level entry point: accepts a Firestore
 *                                     document OR a collection list-response and
 *                                     returns a plain object / array suitable for
 *                                     the EIP normalizeEnterprisePayload pipeline.
 *
 * No Haven-specific knowledge lives here. The Haven field mapping lives in
 * normalizeHavenBooksPayload (below), which is itself just a thin adapter over
 * normalizeEnterprisePayload — so any EIP connector pointing at a Firestore
 * REST endpoint benefits from the generic unpacking automatically.
 */

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

type FirestoreTypedValue = Record<string, unknown>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Returns true when the given value looks like a Firestore REST document
 * (`{ name, fields }`) or a collection list response (`{ documents: [...] }`).
 */
export function isFirestoreResponse(raw: unknown): boolean {
  if (!isObject(raw)) return false;
  // Collection list: { documents: [...] }
  if (Array.isArray((raw as { documents?: unknown }).documents)) return true;
  // Single document: { name: "projects/...", fields: {...} }
  if (
    typeof (raw as { name?: unknown }).name === 'string' &&
    (raw as { name: string }).name.startsWith('projects/') &&
    isObject((raw as { fields?: unknown }).fields)
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Value unpacking
// ---------------------------------------------------------------------------

/**
 * Recursively unwrap a Firestore typed-value envelope into a plain JS value.
 *
 * Firestore integer/double values are returned as JS numbers.
 * Timestamps are returned as ISO strings.
 * Arrays and maps are recursively unpacked.
 * Unknown or null values return null.
 */
export function unpackFirestoreValue(val: unknown): unknown {
  if (!isObject(val)) return val ?? null;

  const v = val as FirestoreTypedValue;

  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return String(v.timestampValue);
  if ('stringValue' in v) return String(v.stringValue);
  if ('bytesValue' in v) return v.bytesValue; // leave as base64 string

  if ('arrayValue' in v) {
    const arrWrap = v.arrayValue;
    if (isObject(arrWrap) && Array.isArray((arrWrap as { values?: unknown }).values)) {
      return ((arrWrap as { values: unknown[] }).values).map(unpackFirestoreValue);
    }
    return [];
  }

  if ('mapValue' in v) {
    const mapWrap = v.mapValue;
    if (isObject(mapWrap) && isObject((mapWrap as { fields?: unknown }).fields)) {
      return unpackFirestoreFields((mapWrap as { fields: Record<string, unknown> }).fields);
    }
    return {};
  }

  // No recognised type key — might already be a plain value from a non-Firestore source.
  return v;
}

/**
 * Unwrap a Firestore `fields` map (`{ fieldName: TypedValue, ... }`) into a
 * plain `{ fieldName: jsValue, ... }` object.
 */
export function unpackFirestoreFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, typedVal] of Object.entries(fields)) {
    out[key] = unpackFirestoreValue(typedVal);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Top-level normalizer
// ---------------------------------------------------------------------------

/**
 * Normalise a raw Firestore REST API response into a plain JS object (document)
 * or an array of plain JS objects (collection list).
 *
 * Returned shape:
 *   - Single document → plain object with the document's fields at the top level,
 *     plus `_firestoreName` (document path) and `_firestoreUpdatedAt`.
 *   - Collection list → `{ documents: PlainObject[] }` where each entry is a
 *     plain-field object with `_firestoreName`.
 *
 * @param raw  The JSON.parsed body of a Firestore REST GET call.
 */
export function normalizeFirestoreResponse(
  raw: unknown,
): Record<string, unknown> | Record<string, unknown>[] {
  if (!isObject(raw)) return {};

  // ── Collection list ──────────────────────────────────────────────────────
  const docs = (raw as { documents?: unknown }).documents;
  if (Array.isArray(docs)) {
    const plainDocs = docs.map((d) => {
      if (!isObject(d)) return {};
      const { name, fields, createTime, updateTime } = d as {
        name?: string;
        fields?: Record<string, unknown>;
        createTime?: string;
        updateTime?: string;
      };
      return {
        _firestoreName: name ?? '',
        _firestoreUpdatedAt: updateTime ?? createTime ?? '',
        ...(fields ? unpackFirestoreFields(fields) : {}),
      };
    });
    return { documents: plainDocs } as unknown as Record<string, unknown>[];
  }

  // ── Single document ───────────────────────────────────────────────────────
  const { name, fields, createTime, updateTime } = raw as {
    name?: string;
    fields?: Record<string, unknown>;
    createTime?: string;
    updateTime?: string;
  };
  return {
    _firestoreName: name ?? '',
    _firestoreUpdatedAt: updateTime ?? createTime ?? '',
    ...(fields ? unpackFirestoreFields(fields) : {}),
  };
}

// ---------------------------------------------------------------------------
// Haven-specific EIP payload adapter
// ---------------------------------------------------------------------------

/**
 * Book record shape after Firestore unpacking (Haven books_catalogue document).
 * Only the fields relevant to EIP normalisation are typed here.
 */
interface HavenBook {
  id?: string;
  title?: string;
  author?: string;
  status?: string;    // "published" | "draft" | "coming_soon"
  genre?: string;
  price?: number | string;
  rating?: number | string;
  wordCount?: number | string;
  chapterCount?: number | string;
  active?: boolean;
  isNew?: boolean;
  featured?: boolean;
  description?: string;
  subtitle?: string;
}

/**
 * Convert a Haven `books_catalogue` Firestore document (after
 * `normalizeFirestoreResponse`) into EIP enterprise payload fields suitable
 * for `normalizeEnterprisePayload`.
 *
 * Mapping rationale:
 *  - `connectedSystems` → number of active/published books (each book is a
 *    "system" connected to the Haven reading platform)
 *  - `healthScore`      → % of books with status "published" × 100, clamped to 100
 *  - `openAlerts`       → number of books with status "draft" or "coming_soon"
 *    (not yet live — platform attention may be needed)
 *  - `openDecisions`    → number of featured books (editorial decisions in flight)
 *  - `timeline`         → one entry per book: title + author + genre summary
 *  - `briefHighlight`   → human-readable summary for the EIP Command Center brief
 *  - `systemName`       → "Ellines Haven" (passed through to UEM model)
 *
 * This function does NOT call `normalizeEnterprisePayload` directly so that
 * the caller (sync.ts) can pass the result straight into `normalizeEnterprisePayload`
 * — maintaining the single normalisation path.
 */
export function mapHavenBooksCatalogueToEipPayload(
  plainDoc: Record<string, unknown>,
): Record<string, unknown> {
  const rawBooks = plainDoc.books;
  const books: HavenBook[] = Array.isArray(rawBooks)
    ? (rawBooks as unknown[]).filter((b): b is HavenBook => isObject(b))
    : [];

  const published = books.filter(
    (b) => b.status === 'published' || b.active === true,
  );
  const pending = books.filter(
    (b) =>
      b.status === 'draft' ||
      b.status === 'coming_soon' ||
      (b.active !== true && b.status !== 'published'),
  );
  const featured = books.filter((b) => b.featured === true);

  const healthScore =
    books.length > 0 ? Math.round((published.length / books.length) * 100) : 0;

  // Build timeline: up to 12 entries, most-recent first (original catalogue order)
  const timeline = books.slice(0, 12).map((b) => ({
    title: b.title || 'Untitled Book',
    detail: [
      b.author ? `by ${b.author}` : '',
      b.genre ? b.genre : '',
      b.status === 'published' ? 'Published' : b.status === 'coming_soon' ? 'Coming soon' : 'Draft',
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  const briefHighlight =
    `Ellines Haven: ${published.length} of ${books.length} books published` +
    (pending.length ? `, ${pending.length} pending` : '') +
    (featured.length ? `, ${featured.length} featured` : '') +
    '. African literature platform — Kenya.';

  return {
    healthScore,
    connectedSystems: published.length,
    openAlerts: pending.length,
    openDecisions: featured.length,
    briefHighlight,
    timeline,
    systemName: 'Ellines Haven',
  };
}
