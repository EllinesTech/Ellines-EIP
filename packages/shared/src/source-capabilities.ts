/**
 * Phase 4 — capability derivation from a REAL source response.
 *
 * The problem this exists to solve: an API can answer HTTP 200 for any path and
 * return the same payload. A naive prober would conclude that /sales, /orders
 * and /fleet all "exist", and EIP would report capabilities the business does
 * not have. That is the single most damaging thing a connector can do, so it is
 * guarded here structurally rather than by convention.
 *
 * Rules, in order of authority:
 *
 *  1. A resource exists only if a real response contained a collection of
 *     records. Names are read from the payload, never guessed.
 *  2. A probed path is evidence ONLY if its response is materially different
 *     from the reference response. Identical means catch-all, and a catch-all
 *     path is recorded as such — never as a capability.
 *  3. Pagination is claimed only with evidence. A `count` field is a reported
 *     total, never proof that paging exists or that EIP read everything.
 *  4. Nothing here can mark anything AVAILABLE. That requires a real retrieval
 *     and is applied by the sync path.
 */

import {
  buildRegistryFromOpenApi,
  type CapabilityRegistry,
  type DiscoveredOperation,
} from './capability-registry';

/** Stable structural fingerprint. Order-insensitive for object keys. */
export function fingerprint(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): string => {
    if (v === null) return 'null';
    if (Array.isArray(v)) {
      if (seen.has(v)) return '[cycle]';
      seen.add(v);
      return `[${v.map(walk).join(',')}]`;
    }
    if (typeof v === 'object') {
      if (seen.has(v as object)) return '[cycle]';
      seen.add(v as object);
      const keys = Object.keys(v as Record<string, unknown>).sort();
      return `{${keys.map((k) => `${k}:${walk((v as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    return `${typeof v}:${String(v)}`;
  };
  return walk(value);
}

export interface RecordCollection {
  /** Field name exactly as the source spells it. */
  name: string;
  count: number;
  /** True when every element looks like a record rather than a scalar list. */
  looksLikeRecords: boolean;
}

/**
 * Locate collections of records in a real payload.
 *
 * Only arrays whose elements are objects qualify. A payload with no such array
 * yields zero collections — which is the honest answer for a source that
 * returns scalars, an error object, or nothing.
 */
export function findRecordCollections(payload: unknown, maxDepth = 3): RecordCollection[] {
  const out: RecordCollection[] = [];
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > maxDepth) return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (!Array.isArray(value) || value.length === 0) continue;
      const objects = value.filter((e) => e && typeof e === 'object' && !Array.isArray(e));
      if (objects.length > 0) {
        out.push({ name: key, count: value.length, looksLikeRecords: true });
      }
      visit(value, depth + 1);
    }
  };
  visit(payload, 0);
  return out;
}

/** A total the SOURCE reported. Never a count of what EIP retrieved. */
export function readReportedTotal(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  for (const k of ['total', 'totalCount', 'total_count', 'count', 'totalResults', 'total_records']) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

export interface ProbeOutcome {
  path: string;
  status: number;
  /** Structural fingerprint of the response body. */
  fingerprint: string;
  /** Bytes compared, so an empty/error body is distinguishable. */
  bytes: number;
}

export interface ProbeAssessment {
  /** Paths that returned something materially different from the reference. */
  distinct: string[];
  /**
   * Paths whose response is indistinguishable from the reference. These prove
   * nothing exists at them and must never become capabilities.
   */
  catchAll: string[];
  /** Paths that did not answer successfully. */
  failed: string[];
  /** True when every successful probe matched the reference: a catch-all source. */
  sourceIsCatchAll: boolean;
}

/**
 * Decide which probed paths are real evidence.
 *
 * This is the anti-fabrication gate. A path is only "distinct" when its
 * response structure differs from the reference; otherwise the source is
 * answering every path with the same body and the path proves nothing.
 */
export function assessProbes(reference: ProbeOutcome, probes: ProbeOutcome[]): ProbeAssessment {
  const distinct: string[] = [];
  const catchAll: string[] = [];
  const failed: string[] = [];
  for (const p of probes) {
    if (p.status >= 400 || p.status === 0) {
      failed.push(p.path);
    } else if (p.fingerprint === reference.fingerprint) {
      catchAll.push(p.path);
    } else {
      distinct.push(p.path);
    }
  }
  const answered = probes.filter((p) => p.status > 0 && p.status < 400);
  return {
    distinct,
    catchAll,
    failed,
    sourceIsCatchAll: answered.length > 0 && distinct.length === 0 && catchAll.length > 0,
  };
}

export interface DerivedCapabilityReport {
  registry: CapabilityRegistry;
  /** Human-readable account of what was and was not discoverable. */
  notes: string[];
  /** Resources the payload genuinely contained. */
  discovered: string[];
  /** Paths that answered but proved nothing (catch-all). */
  rejectedPaths: string[];
  /** Total the source itself reported, when it published one. */
  reportedTotal: number | null;
}

/**
 * Derive a capability registry from a real response plus real probe outcomes.
 *
 * Every resource here traces to an actual collection in an actual response.
 * Nothing is inferred from the system name, the URL, the HTTP status, or the
 * path that was requested.
 */
export function deriveRegistryFromResponse(input: {
  systemName: string;
  /** The real parsed body the source returned. */
  payload: unknown;
  /** Probe outcomes including the reference (base) response. */
  probes?: { reference: ProbeOutcome; others: ProbeOutcome[] };
  /** True only when the source demonstrably ignored paging parameters. */
  paginationObserved?: 'none' | 'offset' | 'cursor' | 'page' | 'unknown';
  now?: string;
}): DerivedCapabilityReport {
  const notes: string[] = [];
  const collections = findRecordCollections(input.payload);
  const reportedTotal = readReportedTotal(input.payload);

  // Resources come from the payload's own field names.
  const operations: DiscoveredOperation[] = collections.map((c) => ({
    path: `/${c.name}`,
    method: 'GET',
    capability: c.name,
    tags: [],
  }));

  const assessment = input.probes
    ? assessProbes(input.probes.reference, input.probes.others)
    : null;

  let registry = buildRegistryFromOpenApi({
    systemName: input.systemName,
    endpoints: operations,
    now: input.now,
  });

  // Attach the source-reported total. This is what the SOURCE claims, kept
  // strictly separate from what EIP retrieved. Left undefined when the source
  // published no total, so nothing downstream can mistake absence for zero.
  if (reportedTotal !== null) {
    registry = {
      ...registry,
      resources: registry.resources.map((r) => ({
        ...r,
        reportedRecordCount: reportedTotal,
      })),
    };
  }

  if (!collections.length) {
    notes.push(
      'The response contained no collection of records, so no capability could be ' +
        'confirmed from it. EIP reports none rather than inferring any.',
    );
  } else {
    notes.push(
      `Confirmed ${collections.length} resource(s) from the real response: ` +
        `${collections.map((c) => `${c.name} (${c.count})`).join(', ')}.`,
    );
  }

  if (assessment?.sourceIsCatchAll) {
    notes.push(
      'This source answers every probed path with the same payload, so those paths ' +
        'prove nothing and were NOT recorded as capabilities. HTTP 200 alone is not ' +
        'evidence that a resource exists.',
    );
  } else if (assessment) {
    if (assessment.distinct.length) {
      notes.push(`Distinct resource paths observed: ${assessment.distinct.join(', ')}.`);
    }
    if (assessment.failed.length) {
      notes.push(
        `Paths that did not answer successfully (existence unconfirmed): ` +
          `${assessment.failed.join(', ')}.`,
      );
    }
  }

  notes.push(
    input.paginationObserved === 'none'
      ? 'The source ignored paging parameters, so no pagination is claimed and the ' +
        'retrieval is a single response rather than a walk of pages.'
      : 'No paging behaviour was demonstrated by the source.',
  );

  return {
    registry,
    notes,
    discovered: collections.map((c) => c.name),
    rejectedPaths: assessment?.catchAll ?? [],
    reportedTotal,
  };
}

