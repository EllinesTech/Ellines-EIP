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
 *  isFirestoreResponse(raw)         — detects a Firestore REST document or
 *                                     collection response by its shape.
 *  unpackFirestoreValue(val)        — recursively unwraps a single typed value.
 *  unpackFirestoreFields(fields)    — unwraps a `fields` map into a plain object.
 *  normalizeFirestoreResponse(raw)  — top-level entry point: accepts a Firestore
 *                                     document OR a collection list-response and
 *                                     returns plain JS objects, free of typed-value
 *                                     envelopes, ready for normalizeEnterprisePayload.
 *
 * ── Design boundary ──────────────────────────────────────────────────────────
 * This module knows about the Firestore REST wire format — nothing else.
 * It contains NO knowledge of any specific business system (Haven, SAP, etc.).
 * The result of normalizeFirestoreResponse is plain JSON. Any system-specific
 * interpretation of that JSON (e.g. which field is a "health score") belongs at
 * the business API boundary of the system being connected, not here.
 *
 * EIP's normalizeEnterprisePayload handles the plain result generically:
 * it picks up whatever fields happen to match the enterprise schema
 * (healthScore, timeline, briefHighlight, etc.) and infers what it cannot find.
 * ─────────────────────────────────────────────────────────────────────────────
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
 * (`{ name: "projects/...", fields: {...} }`) or a collection list response
 * (`{ documents: [...] }`).
 *
 * This is a structural check on the Firestore wire format only — it does not
 * test for any specific project, collection, or document path.
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
 *     plus `_firestoreName` (document path) and `_firestoreUpdatedAt` (metadata).
 *   - Collection list → `{ documents: PlainObject[] }` where each entry is a
 *     plain-field object with `_firestoreName`.
 *
 * The caller passes this plain object to normalizeEnterprisePayload.
 * normalizeEnterprisePayload handles it the same way it handles any other JSON
 * from a REST connector — field mapping is inferred generically.
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
