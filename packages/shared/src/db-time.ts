/**
 * Database timestamps are stored as UTC but returned WITHOUT a zone.
 *
 * WHY THIS EXISTS
 * ---------------
 * Prisma maps `DateTime` to Postgres `timestamp without time zone` (there is no
 * `@db.Timestamptz` in the schema) and always writes UTC into it. PostgREST
 * returns the column verbatim, so a row written three seconds ago comes back as
 * `2026-10-01T04:24:10.027` — no `Z`, no offset.
 *
 * `new Date('2026-10-01T04:24:10.027')` reads a zone-less string as LOCAL time.
 * On a UTC+3 host that made a connector synced seconds earlier measure 180
 * minutes old, so `/connectors/health` and the source graph both reported STALE
 * for a real, successful sync. Freshness must not depend on the timezone of
 * whoever happens to read the row.
 *
 * Zone-less values are therefore pinned to UTC — that is what the database
 * actually stores — while values that already carry `Z` / `+03:00` are trusted
 * as given. Unparsable input returns null: no measurement, never "now".
 */

/** `2026-10-01 04:24:10.027` (psql text) or `2026-10-01T04:24:10.027` (PostgREST). */
const ZONELESS_UTC = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Milliseconds since the epoch, or null when the value is missing/unparsable.
 *
 * Never falls back to `Date.now()`: an unreadable timestamp is an unmeasured
 * fact, and treating it as "just now" is how a stale source reads as fresh.
 */
export function toInstantMs(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const normalized = ZONELESS_UTC.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The same instant as an explicit UTC ISO string (always ends in `Z`), or null.
 *
 * Use this for anything a client will `new Date()` or render: it removes the
 * dependence on the reader's timezone.
 */
export function toUtcIso(value: string | null | undefined): string | null {
  const ms = toInstantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}
