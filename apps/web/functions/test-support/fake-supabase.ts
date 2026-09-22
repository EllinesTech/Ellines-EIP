/**
 * Minimal in-memory stand-in for the Supabase service-role client used by Pages Functions.
 *
 * Phase 2 requires BEHAVIOURAL evidence (tenant isolation, negative authorization, audit
 * presence), not just source-shape checks, so these tests drive the real handlers with this
 * fake and assert on the rows and filters the handlers actually produce.
 *
 * Supports the query shapes used across `apps/web/functions`: select/insert/update/delete with
 * eq/neq/gte/lte/ilike/in, order/limit/range, maybeSingle/single, count/head, plus a thenable
 * builder so `await supabase.from(...).select(...).eq(...)` works.
 *
 * Test-support only: `functions/**` route files are what Cloudflare deploys, and this folder is
 * excluded from the route surface by never exporting `onRequest`.
 */

export type FakeRow = Record<string, any>;

export interface FakeCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  filters: Array<{ column: string; operator: string; value: unknown }>;
  payload?: unknown;
}

export interface FakeResult {
  data: any;
  error: { message: string } | null;
  count?: number | null;
}

interface Filter {
  column: string;
  operator: string;
  value: unknown;
}

function compare(left: unknown, right: unknown): number {
  if (String(left) < String(right)) return -1;
  if (String(left) > String(right)) return 1;
  return 0;
}

function matches(row: FakeRow, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const value = row[filter.column];
    switch (filter.operator) {
      case 'eq':
        return value === filter.value;
      case 'neq':
        return value !== filter.value;
      case 'gte':
        return value !== undefined && value !== null && compare(value, filter.value) >= 0;
      case 'lte':
        return value !== undefined && value !== null && compare(value, filter.value) <= 0;
      case 'ilike':
        return (
          typeof value === 'string' &&
          value.toLowerCase().startsWith(String(filter.value).replace(/%/g, '').toLowerCase())
        );
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
      default:
        return true;
    }
  });
}

export class FakeQuery implements PromiseLike<FakeResult> {
  private filters: Filter[] = [];
  private op: FakeCall['op'] = 'select';
  private payload: unknown = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rangeSpec: { from: number; to: number } | null = null;
  private limitSpec: number | null = null;
  private countMode = false;
  private headMode = false;
  private singleMode = false;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    if (this.op === 'select' && options) {
      if (options.count) this.countMode = true;
      if (options.head) this.headMode = true;
    }
    return this;
  }

  insert(payload: unknown): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: unknown): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.filter(column, 'eq', value);
  }
  neq(column: string, value: unknown): this {
    return this.filter(column, 'neq', value);
  }
  gte(column: string, value: unknown): this {
    return this.filter(column, 'gte', value);
  }
  lte(column: string, value: unknown): this {
    return this.filter(column, 'lte', value);
  }
  ilike(column: string, value: unknown): this {
    return this.filter(column, 'ilike', value);
  }
  in(column: string, value: unknown[]): this {
    return this.filter(column, 'in', value);
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  range(from: number, to: number): this {
    this.rangeSpec = { from, to };
    return this;
  }

  limit(count: number): this {
    this.limitSpec = count;
    return this;
  }

  maybeSingle(): Promise<FakeResult> {
    this.singleMode = true;
    return this.execute();
  }

  single(): Promise<FakeResult> {
    this.singleMode = true;
    return this.execute();
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private filter(column: string, operator: string, value: unknown): this {
    this.filters.push({ column, operator, value });
    return this;
  }


  private async execute(): Promise<FakeResult> {
    const { db, table } = this;
    db.calls.push({
      table,
      op: this.op,
      filters: [...this.filters],
      payload: this.payload ?? undefined,
    });

    // Failure injection: a hung dependency (probe timeout) or a hard error.
    if (db.hangs.has(table)) {
      return new Promise<FakeResult>(() => {
        /* intentionally never settles — simulates a dependency that stops responding */
      });
    }
    const failure = db.errors[table];
    if (failure) return { data: null, error: failure, count: null };

    if (this.op === 'insert') {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]) as FakeRow[];
      const stored = incoming.map((row) => ({ ...row, id: row.id ?? db.nextId(table) }));
      db.rows(table).push(...stored);
      return { data: this.singleMode ? stored[0] ?? null : stored, error: null };
    }

    if (this.op === 'update') {
      const targets = db.rows(table).filter((row) => matches(row, this.filters));
      for (const row of targets) Object.assign(row, this.payload as FakeRow);
      return { data: targets, error: null };
    }

    if (this.op === 'delete') {
      const all = db.rows(table);
      const keep = all.filter((row) => !matches(row, this.filters));
      db.tables[table] = keep;
      return { data: null, error: null, count: all.length - keep.length };
    }

    let selected = db.rows(table).filter((row) => matches(row, this.filters));
    const total = selected.length;
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      selected = [...selected].sort((a, b) =>
        ascending ? compare(a[column], b[column]) : compare(b[column], a[column]),
      );
    }
    if (this.rangeSpec) selected = selected.slice(this.rangeSpec.from, this.rangeSpec.to + 1);
    if (this.limitSpec !== null) selected = selected.slice(0, this.limitSpec);

    return {
      data: this.headMode ? null : this.singleMode ? selected[0] ?? null : selected,
      error: null,
      count: this.countMode ? total : null,
    };
  }
}

export class FakeSupabase {
  readonly tables: Record<string, FakeRow[]> = {};
  readonly calls: FakeCall[] = [];
  readonly errors: Record<string, { message: string }> = {};
  readonly hangs = new Set<string>();
  private idSeq = 0;

  nextId(table: string): string {
    this.idSeq += 1;
    return `fake-${table}-${this.idSeq}`;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  seed(table: string, rows: FakeRow[]): this {
    this.tables[table] = rows.map((row) => ({ ...row }));
    return this;
  }

  /** Live row array for a table (created on demand so inserts are never lost). */
  rows(table: string): FakeRow[] {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }

  callsTo(table: string, op?: FakeCall['op']): FakeCall[] {
    return this.calls.filter((call) => call.table === table && (!op || call.op === op));
  }

  /** Payloads of every insert against a table (flattened). */
  insertsTo(table: string): FakeRow[] {
    return this.callsTo(table, 'insert').flatMap((call) =>
      (Array.isArray(call.payload) ? call.payload : [call.payload]) as FakeRow[],
    );
  }

  failTable(table: string, message = 'database unavailable'): this {
    this.errors[table] = { message };
    return this;
  }

  hangTable(table: string): this {
    this.hangs.add(table);
    return this;
  }
}
