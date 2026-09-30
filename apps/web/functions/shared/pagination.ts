/**
 * Authoritative pagination / retrieval engine for connector reads.
 *
 * EIP's core rule: never claim a connected system was read completely when only
 * part of it was retrieved. This module follows an API's pagination strategy to
 * exhaustion and reports, separately:
 *
 *   retrievedRecordCount — rows EIP actually received and kept
 *   reportedRecordCount  — what the remote API *said* the total was (0 = not reported)
 *   complete             — true only when pagination provably terminated
 *
 * `complete: false` is a legitimate, expected outcome. It surfaces as a PARTIAL
 * sync — never smoothed over into a success.
 *
 * Supported strategies (auto-detected, or forced by the caller):
 *   1. page/pageSize      ?page=1&pageSize=100
 *   2. offset/limit       ?offset=0&limit=100
 *   3. cursor             ?cursor=…  or body { nextCursor }
 *   4. continuation token X-Next-Token header / body continuationToken
 *   5. next link          body { next } / { nextUrl } / { links.next } / Link header
 *   6. total/count present terminates once retrieved >= reported total
 *   7. empty final page   terminates on the first page returning zero rows
 *
 * Safety limits (maxPages, maxRecords) bound a runaway API. Hitting one is
 * reported as incomplete with a reason — never as a complete read.
 */

export type PaginationStrategy =
  | 'page' | 'offset' | 'cursor' | 'token' | 'next-link' | 'single' | 'auto';

export interface RetrievalLimits {
  /** Hard cap on pages fetched (protects against infinite loops). */
  maxPages?: number;
  /** Hard cap on records retained. Exceeding it means incomplete. */
  maxRecords?: number;
  /** Per-request timeout in ms (advisory for the caller's fetcher). */
  timeoutMs?: number;
}

export interface PageResult {
  /** Parsed JSON body (null for empty/204). */
  body: unknown;
  /** Response headers, lowercased keys. */
  headers: Record<string, string>;
  status: number;
}

export type RetrievalStopReason =
  | 'complete'            // pagination provably exhausted
  | 'empty-page'          // API returned zero records — no more data
  | 'max-pages'           // safety limit reached
  | 'max-records'         // safety limit reached
  | 'error'               // a page failed; what was retrieved so far is partial
  | 'no-more-indicator';  // API signalled the end (next absent, link absent)

export interface RetrievalResult {
  /** Every record retrieved, in retrieval order. */
  records: unknown[];
  /** Records actually retrieved and retained. */
  retrievedRecordCount: number;
  /** Total the remote API reported, when it exposes one. 0 = not reported. */
  reportedRecordCount: number;
  /** True ONLY when pagination provably reached the end. */
  complete: boolean;
  stopReason: RetrievalStopReason;
  pagesFetched: number;
  /** Per-page failures. Never swallowed. */
  errors: { page: number; reason: string }[];
  /** Non-fatal issues: dedupe drops, truncation, limits hit. */
  warnings: string[];
  duplicateCount: number;
  strategy: Exclude<PaginationStrategy, 'auto'>;
}

export const DEFAULT_RETRIEVAL_LIMITS: Required<RetrievalLimits> = {
  maxPages: 200,
  maxRecords: 100_000,
  timeoutMs: 15_000,
};

const ARRAY_CONTAINER_KEYS = [
  'data', 'results', 'items', 'records', 'rows', 'entries', 'values',
  'content', 'list', 'docs', 'documents', 'elements', 'hits',
] as const;

const TOTAL_KEYS = [
  'total', 'totalCount', 'total_count', 'count', 'totalRecords',
  'totalResults', 'total_items', 'numFound',
] as const;

const NEXT_LINK_KEYS = ['next', 'nextUrl', 'next_url', 'nextHref', 'nextPage', 'next_page'] as const;
const CURSOR_KEYS = [
  'nextCursor', 'next_cursor', 'cursor', 'continuation', 'nextToken',
  'next_token', 'after',
] as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function firstNumber(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const n = Number(source[k]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function firstString(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Locate the record array inside an arbitrary API envelope.
 * Handles bare arrays, {data:[…]}, {results:{items:[…]}} and friends.
 * Returns null when the body contains no record array.
 */
export function extractRecords(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  const root = asRecord(body);
  for (const key of ARRAY_CONTAINER_KEYS) {
    const v = root[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const nested = extractRecords(v);
      if (nested) return nested;
    }
  }
  return null;
}

/** Read a reported total from common envelope shapes. 0 = not reported. */
export function extractReportedTotal(body: unknown): number {
  if (Array.isArray(body)) return 0; // bare arrays never report a total
  const root = asRecord(body);
  const direct = firstNumber(root, TOTAL_KEYS);
  if (direct !== null) return direct;
  for (const key of ARRAY_CONTAINER_KEYS) {
    const v = root[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = firstNumber(v as Record<string, unknown>, TOTAL_KEYS);
      if (nested !== null) return nested;
    }
  }
  const meta = asRecord(root.meta ?? root.pagination ?? root.page);
  return firstNumber(meta, TOTAL_KEYS) ?? 0;
}

/** Read an absolute or relative next-page URL, if the API provides one. */
export function extractNextLink(body: unknown, headers: Record<string, string>): string | null {
  const root = asRecord(body);
  for (const key of NEXT_LINK_KEYS) {
    const v = root[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const links = asRecord(root.links ?? root._links);
  if (typeof links.next === 'string' && links.next.trim()) return links.next.trim();
  if (links.next && typeof links.next === 'object') {
    const href = (links.next as Record<string, unknown>).href;
    if (typeof href === 'string' && href.trim()) return href.trim();
  }
  const header = headers['x-next-page'] ?? headers['x-next-url'];
  if (header && header.trim()) return header.trim();
  const linkHeader = headers['link'];
  if (linkHeader) {
    const m = /<([^>]+)>;\s*rel="?next"?/i.exec(linkHeader);
    if (m) return m[1];
  }
  return null;
}

/** Read a cursor/continuation token from the body or headers. */
export function extractCursor(body: unknown, headers: Record<string, string>): string | null {
  const root = asRecord(body);
  const direct = firstString(root, CURSOR_KEYS);
  if (direct) return direct;
  for (const key of ARRAY_CONTAINER_KEYS) {
    const v = root[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = firstString(v as Record<string, unknown>, CURSOR_KEYS);
      if (nested) return nested;
    }
  }
  const meta = asRecord(root.meta ?? root.pagination);
  const fromMeta = firstString(meta, CURSOR_KEYS);
  if (fromMeta) return fromMeta;
  const h = headers['x-next-token'] ?? headers['x-continuation-token'];
  return h && h.trim() ? h.trim() : null;
}

/**
 * Infer the pagination strategy from the first response.
 * Order matters: an explicit next link is the strongest signal, then a cursor,
 * then page/offset parameters the API echoes back.
 */
export function detectStrategy(
  body: unknown,
  headers: Record<string, string>,
  url: string,
): Exclude<PaginationStrategy, 'auto'> {
  if (extractNextLink(body, headers)) return 'next-link';
  if (extractCursor(body, headers)) return 'cursor';
  if (Array.isArray(body)) return 'single';
  const root = asRecord(body);
  const meta = asRecord(root.meta ?? root.pagination);
  if (meta.offset !== undefined || meta.limit !== undefined) return 'offset';
  if (meta.page !== undefined || meta.pageSize !== undefined) return 'page';
  try {
    const u = new URL(url);
    if (u.searchParams.has('page') || u.searchParams.has('pageNumber') || u.searchParams.has('page[number]')) return 'page';
    if (u.searchParams.has('offset') || u.searchParams.has('skip')) return 'offset';
    if (u.searchParams.has('cursor') || u.searchParams.has('after')) return 'cursor';
  } catch {
    /* relative URL — fall through to the body-shape checks */
  }
  if (root.offset !== undefined || root.limit !== undefined) return 'offset';
  if (root.page !== undefined || root.pageNumber !== undefined || root.nextPage !== undefined) return 'page';
  return 'single';
}

/** Stable identity for cross-page de-duplication. */
function recordIdentity(rec: unknown, index: number): string {
  const r = asRecord(rec);
  const id = r.id ?? r.ID ?? r.uuid ?? r.key ?? r.pk ?? r._id ?? r.guid;
  if (id !== undefined && id !== null && String(id).trim()) return `id:${String(id)}`;
  return `idx:${index}:${safeStringify(rec)}`;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return String(v);
  }
}

function withParam(url: string, key: string, value: string): string {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}

export interface RetrieveOptions {
  /** Absolute first-page URL. The engine rewrites the query per strategy. */
  startUrl: string;
  /** Performs one HTTP GET. Throwing signals a page-level failure. */
  fetchPage: (url: string, attempt: number) => Promise<PageResult>;
  strategy?: PaginationStrategy;
  limits?: RetrievalLimits;
  /** Page size for page/offset strategies. */
  pageSize?: number;
  /** De-duplicate records by id across pages. Default true. */
  dedupe?: boolean;
}

/**
 * Retrieve the complete authorized result set from a paginated (or single-page)
 * API, following pagination until the API proves there is no more data.
 *
 * The returned `complete` flag is the load-bearing output: callers must not
 * report a successful, fully-synced state when it is false.
 */
export async function retrieveAllPages(options: RetrieveOptions): Promise<RetrievalResult> {
  const limits = { ...DEFAULT_RETRIEVAL_LIMITS, ...(options.limits ?? {}) };
  const dedupe = options.dedupe !== false;
  const pageSize = Math.max(1, options.pageSize ?? 100);
  const forced = options.strategy && options.strategy !== 'auto' ? options.strategy : null;

  const records: unknown[] = [];
  const seen = new Set<string>();
  const errors: { page: number; reason: string }[] = [];
  const warnings: string[] = [];
  let duplicateCount = 0;
  let reportedRecordCount = 0;
  let pagesFetched = 0;
  let strategy: Exclude<PaginationStrategy, 'auto'> = forced ?? 'single';
  let stopReason: RetrievalStopReason = 'complete';
  let complete = false;
  let terminated = false;

  let url: string | null = options.startUrl;
  let pageNumber = 1;
  let offset = 0;
  let cursor: string | null = null;

  while (url && !terminated) {
    if (pagesFetched >= limits.maxPages) {
      stopReason = 'max-pages';
      warnings.push(
        `Stopped after ${limits.maxPages} pages (safety limit). The authorized result set is larger than one sync.`,
      );
      break;
    }
    if (records.length >= limits.maxRecords) {
      stopReason = 'max-records';
      warnings.push(`Stopped after ${limits.maxRecords} records (safety limit). Retrieval is incomplete.`);
      break;
    }

    let result: PageResult;
    try {
      result = await options.fetchPage(url, pageNumber);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Request failed';
      errors.push({ page: pageNumber, reason });
      stopReason = 'error';
      break;
    }
    pagesFetched += 1;

    // Non-2xx is a hard failure for this page. Never substitute invented records.
    if (result.status < 200 || result.status >= 300) {
      const reason = `HTTP ${result.status}`;
      errors.push({ page: pageNumber, reason });
      stopReason = 'error';
      if (result.status === 401 || result.status === 403) {
        warnings.push('Authentication/authorization rejected by the source system.');
      } else if (result.status === 429) {
        warnings.push('Rate limited by the source system (HTTP 429).');
      }
      break;
    }

    const body = result.body;
    const pageRecords = extractRecords(body);

    if (pagesFetched === 1 && !forced) {
      strategy = detectStrategy(body, result.headers, url);
    }

    // A 200 with no record array is an empty result set — not a page of data.
    if (pageRecords === null) {
      stopReason = records.length === 0 ? 'empty-page' : 'no-more-indicator';
      complete = reportedRecordCount === 0 || records.length >= reportedRecordCount;
      terminated = true;
      break;
    }

    // The first page's reported total is the best available expectation.
    if (reportedRecordCount === 0) {
      reportedRecordCount = extractReportedTotal(body);
    }

    const beforeIngest = records.length;
    for (const rec of pageRecords) {
      if (records.length >= limits.maxRecords) {
        warnings.push(`Stopped retaining records at the ${limits.maxRecords}-record safety limit.`);
        stopReason = 'max-records';
        terminated = true;
        break;
      }
      if (dedupe) {
        const id = recordIdentity(rec, records.length);
        if (seen.has(id)) {
          duplicateCount += 1;
          continue;
        }
        seen.add(id);
      }
      records.push(rec);
    }
    if (terminated) break;

    // A full page that contributed no new record means the source is repeating
    // itself. Continuing would spin until the page cap, so stop and say so.
    if (
      dedupe &&
      records.length === beforeIngest &&
      pageRecords.length >= pageSize &&
      reportedRecordCount === 0
    ) {
      stopReason = 'error';
      warnings.push(
        'Source system returned a full page containing only records already retrieved; stopping to avoid an infinite loop.',
      );
      break;
    }

    // ── Termination analysis ──────────────────────────────────────────────
    const reportedTotal = reportedRecordCount || 0;

    if (pageRecords.length === 0) {
      stopReason = 'empty-page';
      complete = reportedTotal === 0 || records.length >= reportedTotal;
      terminated = true;
      break;
    }

    if (strategy === 'single') {
      stopReason = 'complete';
      complete = reportedTotal === 0 || records.length >= reportedTotal;
      terminated = true;
      break;
    }

    // When the API published a total, reaching it is the authoritative end.
    if (reportedTotal > 0 && records.length >= reportedTotal) {
      stopReason = 'complete';
      complete = true;
      terminated = true;
      break;
    }

    if (strategy === 'next-link') {
      const next = extractNextLink(body, result.headers);
      if (!next) {
        stopReason = 'no-more-indicator';
        complete = reportedTotal === 0 || records.length >= reportedTotal;
        terminated = true;
        break;
      }
      let nextUrl: string;
      try {
        nextUrl = new URL(next, url).toString();
      } catch {
        stopReason = 'error';
        warnings.push(`Source system returned an unusable next link: ${next}`);
        break;
      }
      if (nextUrl === url) {
        stopReason = 'error';
        warnings.push('Next link did not advance; stopping to avoid an infinite loop.');
        break;
      }
      url = nextUrl;
      pageNumber += 1;
      continue;
    }

    if (strategy === 'cursor' || strategy === 'token') {
      const nextCursor = extractCursor(body, result.headers);
      if (!nextCursor) {
        stopReason = 'no-more-indicator';
        complete = reportedTotal === 0 || records.length >= reportedTotal;
        terminated = true;
        break;
      }
      if (nextCursor === cursor) {
        stopReason = 'error';
        warnings.push('Pagination cursor did not advance; stopping to avoid an infinite loop.');
        break;
      }
      cursor = nextCursor;
      const key = /token/i.test(nextCursor) ? 'continuationToken' : 'cursor';
      url = withParam(url, key, nextCursor);
      pageNumber += 1;
      continue;
    }

    // page / offset strategies
    if (strategy === 'page') {
      pageNumber += 1;
      url = withParam(withParam(url, 'page', String(pageNumber)), 'pageSize', String(pageSize));
      if (pageRecords.length < pageSize) {
        stopReason = 'complete';
        complete = reportedTotal === 0 || records.length >= reportedTotal;
        terminated = true;
        break;
      }
      continue;
    }

    offset += pageRecords.length;
    url = withParam(withParam(url, 'offset', String(offset)), 'limit', String(pageSize));
    if (pageRecords.length < pageSize) {
      stopReason = 'complete';
      complete = reportedTotal === 0 || records.length >= reportedTotal;
      terminated = true;
      break;
    }
  }

  if (stopReason === 'error' || stopReason === 'max-pages' || stopReason === 'max-records') {
    complete = false;
  }
  if (reportedRecordCount > 0 && records.length < reportedRecordCount) complete = false;

  if (duplicateCount > 0) {
    warnings.push(`Removed ${duplicateCount} duplicate record(s) returned across pages.`);
  }
  if (reportedRecordCount > 0 && records.length < reportedRecordCount) {
    warnings.push(
      `Source system reported ${reportedRecordCount} record(s); EIP retrieved ${records.length}.`,
    );
  }

  return {
    records,
    retrievedRecordCount: records.length,
    reportedRecordCount,
    complete,
    stopReason,
    pagesFetched,
    errors,
    warnings,
    duplicateCount,
    strategy,
  };
}




