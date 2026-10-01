/**
 * Pagination / retrieval engine tests.
 *
 * The load-bearing guarantee: EIP must never report a connected system as fully
 * read when it only retrieved part of it. These tests prove the engine follows
 * every common pagination strategy to exhaustion, and reports incompleteness
 * honestly when it cannot.
 */
import {
  retrieveAllPages,
  detectStrategy,
  extractRecords,
  extractReportedTotal,
  type PageResult,
} from '../shared/pagination';

/** Build a fetchPage stub over a fixed list of pages. */
function pagedFetcher(pages: { status?: number; body: unknown; headers?: Record<string, string> }[]) {
  const calls: string[] = [];
  const fetchPage = async (url: string): Promise<PageResult> => {
    calls.push(url);
    const page = pages[Math.min(calls.length - 1, pages.length - 1)];
    return { status: page.status ?? 200, body: page.body, headers: page.headers ?? {} };
  };
  return { fetchPage, calls };
}

describe('extractRecords', () => {
  it('reads a bare array', () => {
    expect(extractRecords([{ id: 1 }])).toEqual([{ id: 1 }]);
  });
  it('reads common envelopes', () => {
    expect(extractRecords({ data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(extractRecords({ results: { items: [{ id: 2 }] } })).toEqual([{ id: 2 }]);
    expect(extractRecords({ rows: [{ id: 3 }] })).toEqual([{ id: 3 }]);
  });
  it('returns null when there is no record array', () => {
    expect(extractRecords({ status: 'ok' })).toBeNull();
    expect(extractRecords({ data: { id: 1 } })).toBeNull();
  });
});

describe('extractReportedTotal', () => {
  it('reads totals from envelopes and meta blocks', () => {
    expect(extractReportedTotal({ data: [], total: 10 })).toBe(10);
    expect(extractReportedTotal({ meta: { total: 42 } })).toBe(42);
    expect(extractReportedTotal({ data: { items: [], count: 7 } })).toBe(7);
  });
  it('returns 0 when no total is reported', () => {
    expect(extractReportedTotal([{ id: 1 }])).toBe(0);
    expect(extractReportedTotal({ data: [] })).toBe(0);
  });
});

describe('detectStrategy', () => {
  it('detects next-link, cursor, page, offset and single', () => {
    expect(detectStrategy({ data: [], next: 'http://x/p2' }, {}, 'http://x/p1')).toBe('next-link');
    expect(detectStrategy({ data: [], nextCursor: 'abc' }, {}, 'http://x')).toBe('cursor');
    expect(detectStrategy({ data: [], meta: { page: 1, pageSize: 10 } }, {}, 'http://x')).toBe('page');
    expect(detectStrategy({ data: [], meta: { offset: 0, limit: 10 } }, {}, 'http://x')).toBe('offset');
    expect(detectStrategy([{ id: 1 }], {}, 'http://x')).toBe('single');
  });
  it('detects an RFC 5988 Link header', () => {
    expect(detectStrategy({ data: [] }, { link: '<http://x/p2>; rel="next"' }, 'http://x')).toBe('next-link');
  });
});

describe('retrieveAllPages', () => {
  it('1. single-page API', async () => {
    const { fetchPage } = pagedFetcher([{ body: { data: [{ id: 1 }, { id: 2 }] } }]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage });
    expect(r.retrievedRecordCount).toBe(2);
    expect(r.complete).toBe(true);
    expect(r.stopReason).toBe('complete');
  });

  it('2. two-page API via next link', async () => {
    const { fetchPage, calls } = pagedFetcher([
      { body: { data: [{ id: 1 }], next: 'http://x/api?p=2' } },
      { body: { data: [{ id: 2 }] } },
    ]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage });
    expect(calls).toHaveLength(2);
    expect(r.retrievedRecordCount).toBe(2);
    expect(r.complete).toBe(true);
  });

  it('3. cursor pagination', async () => {
    const { fetchPage } = pagedFetcher([
      { body: { data: [{ id: 1 }], nextCursor: 'c2' } },
      { body: { data: [{ id: 2 }], nextCursor: null } },
    ]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'cursor' });
    expect(r.retrievedRecordCount).toBe(2);
    expect(r.complete).toBe(true);
  });

  it('4. continuation token in a header', async () => {
    const { fetchPage } = pagedFetcher([
      { body: { data: [{ id: 1 }] }, headers: { 'x-next-token': 'tok2' } },
      { body: { data: [{ id: 2 }] } },
    ]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'token' });
    expect(r.retrievedRecordCount).toBe(2);
    expect(r.complete).toBe(true);
  });

  it('5. offset pagination', async () => {
    // 4 records over 2 full pages, then the empty page that ends an offset API.
    const pages = [
      { body: { data: [{ id: 1 }, { id: 2 }], meta: { offset: 0, limit: 2 } } },
      { body: { data: [{ id: 3 }, { id: 4 }], meta: { offset: 2, limit: 2 } } },
      { body: { data: [], meta: { offset: 4, limit: 2 } } },
    ];
    const { fetchPage, calls } = pagedFetcher(pages);
    const r = await retrieveAllPages({ startUrl: 'http://x/api?offset=0&limit=2', fetchPage, strategy: 'offset', pageSize: 2 });
    expect(r.retrievedRecordCount).toBe(4);
    expect(calls[1]).toContain('offset=2');
    expect(r.complete).toBe(true);
  });

  it('6. empty final page terminates cleanly', async () => {
    const { fetchPage } = pagedFetcher([
      { body: { data: [{ id: 1 }], total: 1 } },
      { body: { data: [] } },
    ]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'page', pageSize: 1 });
    expect(r.retrievedRecordCount).toBe(1);
    expect(r.complete).toBe(true);
    expect(r.stopReason).toBe('complete');
  });

  it('7. API reports more than it returns → incomplete, never overstated', async () => {
    const { fetchPage } = pagedFetcher([{ body: { data: [{ id: 1 }], total: 10000 } }]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'page', pageSize: 1, limits: { maxPages: 1 } });
    expect(r.reportedRecordCount).toBe(10000);
    expect(r.retrievedRecordCount).toBe(1);
    expect(r.complete).toBe(false);
    expect(r.warnings.join(' ')).toContain('10000');
  });

  it('8. failure on page 3 keeps earlier pages and reports incomplete', async () => {
    let n = 0;
    const fetchPage = async (): Promise<PageResult> => {
      n += 1;
      if (n === 3) return { status: 500, body: null, headers: {} };
      return { status: 200, body: { data: [{ id: n }], nextCursor: `c${n + 1}` }, headers: {} };
    };
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'cursor' });
    expect(r.retrievedRecordCount).toBe(2);
    expect(r.complete).toBe(false);
    expect(r.stopReason).toBe('error');
    expect(r.errors[0]).toMatchObject({ page: 3, reason: 'HTTP 500' });
  });

  it('9. authentication failure is surfaced, not swallowed', async () => {
    const { fetchPage } = pagedFetcher([{ status: 401, body: null }]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage });
    expect(r.retrievedRecordCount).toBe(0);
    expect(r.complete).toBe(false);
    expect(r.stopReason).toBe('error');
    expect(r.warnings.join(' ')).toContain('Authentication');
  });

  it('10. rate limit (429) is surfaced', async () => {
    const { fetchPage } = pagedFetcher([{ status: 429, body: null }]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage });
    expect(r.complete).toBe(false);
    expect(r.warnings.join(' ')).toContain('Rate limited');
  });

  it('11. malformed response yields no invented records', async () => {
    const fetchPage = async (): Promise<PageResult> => ({ status: 200, body: '<html>login</html>', headers: {} });
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage });
    expect(r.retrievedRecordCount).toBe(0);
    expect(r.records).toEqual([]);
    // A 200 carrying a body EIP cannot read is NOT a complete read. Reporting it
    // as complete is how a source with real records gets stored as "synced, 0".
    expect(r.complete).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('12. an unparseable body produces zero records, not a fake sync', async () => {
    const fetchPage = async (): Promise<PageResult> => ({ status: 200, body: null, headers: {} });
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage });
    expect(r.retrievedRecordCount).toBe(0);
    expect(r.complete).toBe(false);
    expect(r.stopReason).toBe('error');
  });

  it('12b. HTTP 204 is a real empty answer, not an unreadable body', async () => {
    const fetchPage = async (): Promise<PageResult> => ({ status: 204, body: null, headers: {} });
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage });
    expect(r.retrievedRecordCount).toBe(0);
    expect(r.complete).toBe(true);
    expect(r.stopReason).toBe('empty-page');
    // Complete, but never presented as a capability that was actually read.
    expect(r.errors).toEqual([]);
  });

  it('13. duplicate records across pages are de-duplicated and counted', async () => {
    const { fetchPage } = pagedFetcher([
      { body: { data: [{ id: 1 }, { id: 2 }], nextCursor: 'c2' } },
      { body: { data: [{ id: 2 }, { id: 3 }] } },
    ]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'cursor' });
    expect(r.retrievedRecordCount).toBe(3);
    expect(r.duplicateCount).toBe(1);
  });

  it('14. a 250-record paginated API is fully retrieved, not truncated to one page', async () => {
    const TOTAL = 250;
    const PAGE = 50;
    const fetchPage = async (url: string): Promise<PageResult> => {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      const start = (page - 1) * PAGE;
      const data = Array.from({ length: Math.min(PAGE, TOTAL - start) }, (_, i) => ({ id: start + i + 1 }));
      return { status: 200, body: { data, total: TOTAL, page, pageSize: PAGE }, headers: {} };
    };
    const r = await retrieveAllPages({
      startUrl: `http://x/api?page=1&pageSize=${PAGE}`,
      fetchPage,
      strategy: 'page',
      pageSize: PAGE,
    });
    expect(r.retrievedRecordCount).toBe(TOTAL);
    expect(r.reportedRecordCount).toBe(TOTAL);
    expect(r.complete).toBe(true);
    expect(r.pagesFetched).toBe(5);
    // Every id present — nothing silently dropped.
    expect((r.records as { id: number }[]).map((x) => x.id)).toEqual(
      Array.from({ length: TOTAL }, (_, i) => i + 1),
    );
  });

  it('15. zero records is a complete, honest empty read', async () => {
    const { fetchPage } = pagedFetcher([{ body: { data: [], total: 0 } }]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage });
    expect(r.retrievedRecordCount).toBe(0);
    expect(r.complete).toBe(true);
    expect(r.reportedRecordCount).toBe(0);
  });

  it('16. max-records safety limit is reported as incomplete', async () => {
    // A genuinely large API: unique records and a genuinely advancing cursor,
    // so retrieval is bounded only by the record cap.
    let id = 0;
    let page = 0;
    const fetchPage = async (): Promise<PageResult> => {
      page += 1;
      return {
        status: 200,
        body: {
          data: Array.from({ length: 10 }, () => ({ id: (id += 1) })),
          nextCursor: `cursor-${page}`,
        },
        headers: {},
      };
    };
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'cursor', limits: { maxRecords: 25 } });
    expect(r.retrievedRecordCount).toBe(25);
    expect(r.complete).toBe(false);
    expect(r.stopReason).toBe('max-records');
  });

  it('18. a page of only already-seen records does not loop forever', async () => {
    const { fetchPage, calls } = pagedFetcher([
      { body: { data: [{ id: 1 }, { id: 2 }], nextCursor: 'c2' } },
      { body: { data: [{ id: 1 }, { id: 2 }], nextCursor: 'c3' } },
    ]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'cursor', pageSize: 2 });
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(r.retrievedRecordCount).toBe(2);
    expect(r.complete).toBe(false);
    expect(r.warnings.join(' ')).toContain('only records already retrieved');
  });

  it('17. a non-advancing cursor cannot loop forever', async () => {
    const { fetchPage, calls } = pagedFetcher([{ body: { data: [{ id: 1 }], nextCursor: 'same' } }]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'cursor' });
    expect(calls.length).toBeLessThan(5);
    expect(r.complete).toBe(false);
  });

  it('19. every page is merged, not just the first', async () => {
    const TOTAL = 12;
    const PAGE = 4;
    const fetchPage = async (url: string): Promise<PageResult> => {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      const start = (page - 1) * PAGE;
      return {
        status: 200,
        body: { data: Array.from({ length: Math.min(PAGE, TOTAL - start) }, (_, i) => ({ id: start + i + 1 })), total: TOTAL },
        headers: {},
      };
    };
    const r = await retrieveAllPages({ startUrl: `http://x/api?page=1&pageSize=${PAGE}`, fetchPage, strategy: 'page', pageSize: PAGE });
    const ids = (r.records as { id: number }[]).map((x) => x.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('20. retrieved vs reported are tracked independently', async () => {
    // Source claims 500 but only yields 6 before erroring — EIP must report 6.
    const { fetchPage } = pagedFetcher([{ body: { data: [{ id: 1 }, { id: 2 }, { id: 3 }], total: 500 } }]);
    const r = await retrieveAllPages({ startUrl: 'http://x/api', fetchPage, strategy: 'page', pageSize: 3, limits: { maxPages: 1 } });
    expect(r.reportedRecordCount).toBe(500);
    expect(r.retrievedRecordCount).toBe(3);
    expect(r.complete).toBe(false);
  });
});


