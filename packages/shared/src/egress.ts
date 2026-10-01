/**
 * Ellines EIP — Egress Guard (SSRF-hardened outbound HTTP)
 *
 * Shared-package SSRF guard for Node.js contexts (identity service, tests,
 * tooling). Cloudflare Pages Functions use `apps/web/functions/shared/egress.ts`
 * which relies on Cloudflare's DoH resolver instead of Node's `dns` module.
 *
 * ALL connector outbound HTTP requests must flow through `safeEgressFetch()`.
 * No connector module may call `fetch()` directly.
 *
 * SSRF Guard behaviour:
 * - Blocks non-HTTPS schemes unconditionally.
 * - Checks IP-literal hostnames against private/loopback/link-local CIDR ranges.
 * - Resolves non-literal hostnames via `dns.promises.lookup` to prevent DNS
 *   rebinding attacks (Time-Of-Check / Time-Of-Use mitigation).
 *
 * Blocked ranges (IPv4):
 *   10.0.0.0/8        RFC1918 private
 *   172.16.0.0/12     RFC1918 private
 *   192.168.0.0/16    RFC1918 private
 *   127.0.0.0/8       Loopback
 *   169.254.0.0/16    Link-local / AWS metadata (169.254.169.254)
 *   fd00:ec2::254     AWS IMDSv2 (IPv6)
 *
 * Blocked ranges (IPv6):
 *   ::1               Loopback
 *   fc00::/7          Unique local (includes fd00::/8)
 *   fe80::/10         Link-local
 *
 * Blocked hostnames:
 *   localhost         Loopback name
 *   *.local           mDNS / Bonjour
 *
 * Retry behaviour (egressRequest):
 * - Up to 3 retries on network errors or HTTP 5xx responses.
 * - Exponential backoff: base 30 s, cap 480 s, + ±20% random jitter.
 * - 30 s timeout per attempt via AbortController.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 22.1
 */

// ── Error type ────────────────────────────────────────────────────────────────

/**
 * Thrown when a URL or resolved IP is blocked by the SSRF egress policy.
 *
 * The `reason` property describes WHY the request was blocked. It is safe to
 * log internally but must NEVER be forwarded to API callers (use a generic
 * "URL cannot be reached" message instead).
 */
export class EgressBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`EIP egress guard blocked request: ${reason}`);
    this.name = 'EgressBlockedError';
  }
}

// ── Private IP range helpers ──────────────────────────────────────────────────

/**
 * Parse a dot-notation IPv4 string into a 32-bit unsigned integer.
 * Returns NaN if the string is not a valid IPv4 address.
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return NaN;
  let result = 0;
  for (const part of parts) {
    const octet = parseInt(part, 10);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return NaN;
    result = (result << 8) | octet;
  }
  return result >>> 0; // force unsigned
}

/**
 * Returns true if `ip` falls within the CIDR range defined by `base`/`prefixLen`.
 */
function inCidr(ip: number, base: number, prefixLen: number): boolean {
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ip & mask) === (base & mask);
}

/** Blocked IPv4 CIDR ranges. */
const BLOCKED_V4_CIDRS: Array<{ base: number; prefix: number; reason: string }> = [
  { base: ipv4ToInt('10.0.0.0'),        prefix: 8,  reason: 'RFC1918 private range 10.0.0.0/8' },
  { base: ipv4ToInt('172.16.0.0'),      prefix: 12, reason: 'RFC1918 private range 172.16.0.0/12' },
  { base: ipv4ToInt('192.168.0.0'),     prefix: 16, reason: 'RFC1918 private range 192.168.0.0/16' },
  { base: ipv4ToInt('127.0.0.0'),       prefix: 8,  reason: 'Loopback 127.0.0.0/8' },
  { base: ipv4ToInt('169.254.0.0'),     prefix: 16, reason: 'Link-local / AWS metadata 169.254.0.0/16' },
  { base: ipv4ToInt('169.254.169.254'), prefix: 32, reason: 'AWS IMDS endpoint 169.254.169.254' },
  { base: ipv4ToInt('0.0.0.0'),         prefix: 8,  reason: 'Reserved 0.0.0.0/8' },
  { base: ipv4ToInt('100.64.0.0'),      prefix: 10, reason: 'Shared address space 100.64.0.0/10' },
  { base: ipv4ToInt('240.0.0.0'),       prefix: 4,  reason: 'Reserved 240.0.0.0/4' },
  { base: ipv4ToInt('255.255.255.255'), prefix: 32, reason: 'Broadcast' },
];

/** Returns a block reason if the IPv4 address is in a blocked CIDR, or null. */
function checkIpv4(ip: string): string | null {
  const num = ipv4ToInt(ip);
  if (Number.isNaN(num)) return null; // not an IPv4 literal
  for (const cidr of BLOCKED_V4_CIDRS) {
    if (inCidr(num, cidr.base, cidr.prefix)) return cidr.reason;
  }
  return null;
}

/** Returns a block reason if the IPv6 address is in a blocked range, or null. */
function checkIpv6(hostname: string): string | null {
  // Strip surrounding brackets: [::1] → ::1
  const h = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  if (h === '::1' || h === '::' || h.toLowerCase() === '0:0:0:0:0:0:0:1') {
    return 'IPv6 loopback ::1';
  }
  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(h)) return 'IPv6 link-local fe80::/10';
  // Unique local fc00::/7 (fc00:: through fdff::)
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return 'IPv6 unique local fc00::/7 (includes fd00:ec2::254)';
  return null;
}

// ── Public: validateEgressUrl ─────────────────────────────────────────────────

/**
 * Validate a URL before making any outbound request.
 *
 * For hostnames (non-IP), performs a real `dns.promises.lookup` to resolve the
 * IP and then validates it against the blocked CIDR list. This prevents DNS
 * rebinding attacks that could bypass a pure text-based check.
 *
 * @throws {EgressBlockedError} if the URL is blocked by policy.
 * @throws {TypeError}          if the URL cannot be parsed.
 */
export async function validateEgressUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EgressBlockedError(`URL could not be parsed: ${url}`);
  }

  // 1. Scheme must be https
  if (parsed.protocol !== 'https:') {
    throw new EgressBlockedError(
      `Non-HTTPS scheme "${parsed.protocol}" is not allowed — only https:// is permitted`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Literal "localhost"
  if (hostname === 'localhost') {
    throw new EgressBlockedError('Loopback hostname "localhost" is not allowed');
  }

  // 3. .local TLD (mDNS / Bonjour)
  if (hostname.endsWith('.local')) {
    throw new EgressBlockedError(`mDNS .local hostname "${hostname}" is not allowed`);
  }

  // 4. IPv4 literal check (synchronous — no DNS needed)
  const ipv4Block = checkIpv4(hostname);
  if (ipv4Block !== null) {
    throw new EgressBlockedError(ipv4Block);
  }

  // 5. IPv6 literal check (synchronous — no DNS needed)
  const ipv6Block = checkIpv6(hostname);
  if (ipv6Block !== null) {
    throw new EgressBlockedError(ipv6Block);
  }

  // 6. DNS lookup for non-literal hostnames (DNS rebinding mitigation)
  //    Skip if the hostname looks like an IPv4 or IPv6 literal (already checked above).
  const isIpLiteral = !Number.isNaN(ipv4ToInt(hostname)) || hostname.includes(':');
  if (!isIpLiteral) {
    let resolvedAddress: string;
    try {
      // Dynamic import so this module does not pull 'dns' into browser bundles.
      // In Cloudflare Workers / browser, the dns module is not available;
      // validateEgressUrl should not be called from browser code (use
      // apps/web/functions/shared/egress.ts instead).
      const { promises: dnsPromises } = await import('dns');
      const result = await dnsPromises.lookup(hostname, { verbatim: true });
      resolvedAddress = result.address;
    } catch (err) {
      // DNS resolution failed — fail closed to prevent bypassing the guard
      // via non-existent or temporarily unresolvable hostnames.
      throw new EgressBlockedError(
        `DNS lookup failed for "${hostname}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Re-check the resolved IP
    const resolvedIpv4Block = checkIpv4(resolvedAddress);
    if (resolvedIpv4Block !== null) {
      throw new EgressBlockedError(
        `DNS rebinding blocked: "${hostname}" resolves to private IP ${resolvedAddress} (${resolvedIpv4Block})`,
      );
    }
    const resolvedIpv6Block = checkIpv6(resolvedAddress);
    if (resolvedIpv6Block !== null) {
      throw new EgressBlockedError(
        `DNS rebinding blocked: "${hostname}" resolves to private IPv6 ${resolvedAddress} (${resolvedIpv6Block})`,
      );
    }
  }
}

// ── Public: safeEgressFetch ───────────────────────────────────────────────────

/**
 * Drop-in replacement for `fetch()` that validates the URL through the SSRF
 * guard before making the request.
 *
 * @throws {EgressBlockedError} if the URL is blocked by the egress policy.
 * @throws {Error}              on network errors.
 *
 * // TODO: wire safeEgressFetch when connector proxy is implemented
 */
export async function safeEgressFetch(url: string, init?: RequestInit): Promise<Response> {
  await validateEgressUrl(url);
  return fetch(url, init);
}

// ── Public: egressRequest (with retry) ───────────────────────────────────────

/** Options accepted by `egressRequest`. */
export interface EgressOptions {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  /** Per-attempt timeout in ms. Default: 30 000. */
  timeoutMs?: number;
  /** Maximum retry attempts after the first try. Default: 3. */
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 480_000;

/** Exponential backoff with ±20% jitter, capped at BACKOFF_CAP_MS. */
function backoffMs(attempt: number): number {
  const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(base + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make a hardened outbound HTTP request through the SSRF guard.
 *
 * - Validates the URL with `validateEgressUrl()` before any network call.
 * - Enforces a per-attempt timeout (default 30 s) via `AbortController`.
 * - Retries up to `maxRetries` times on network errors or HTTP 5xx with
 *   exponential backoff (base 30 s, cap 480 s, ±20% jitter).
 * - Throws the last error after retry exhaustion.
 *
 * @throws {EgressBlockedError} immediately, without retry, on SSRF policy violation.
 * @throws {Error}              after all retry attempts are exhausted.
 */
export async function egressRequest(opts: EgressOptions): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

  // Validate URL once before any attempt — throws immediately on SSRF block.
  await validateEgressUrl(opts.url);

  let lastError: Error = new Error('No attempt was made');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(opts.url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        signal: controller.signal,
      });

      // Success or a non-5xx response is returned as-is — let the caller decide.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // HTTP 5xx — retry-eligible
      lastError = new Error(`HTTP ${response.status} from ${new URL(opts.url).hostname}`);

    } catch (err) {
      if (err instanceof EgressBlockedError) throw err; // never retry SSRF blocks
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timer);
    }

    // Don't sleep after the last attempt
    if (attempt < maxRetries) {
      await sleep(backoffMs(attempt));
    }
  }

  throw lastError;
}
