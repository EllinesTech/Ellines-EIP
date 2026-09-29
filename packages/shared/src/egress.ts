/**
 * Ellines EIP — Egress Function (SSRF-hardened outbound HTTP)
 *
 * ALL connector outbound HTTP requests must flow through `egressRequest()`.
 * No connector module may call `fetch()` directly.
 *
 * SSRF Guard behaviour:
 * - Blocks non-HTTPS schemes unconditionally.
 * - Checks IP-literal hostnames against private/loopback/link-local CIDR ranges.
 * - In Cloudflare Workers, full DNS resolution is not available at validation time.
 *   Hostname-based SSRF (DNS rebinding) is a known limitation and must be mitigated
 *   at the network layer (e.g. Cloudflare egress firewall). This module guards
 *   against IP-literal bypass attempts and non-HTTPS schemes.
 *
 * Retry behaviour:
 * - Up to 3 retries on network errors or HTTP 5xx responses.
 * - Exponential backoff: base 30 s, cap 480 s, + ±20% random jitter.
 * - 30 s timeout per attempt via AbortController.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 22.1
 */

// ─── Error type ───────────────────────────────────────────────────────────────

export class EgressBlockedError extends Error {
  constructor(
    public readonly blockedHostname: string,
    public readonly blockReason: string,
    public readonly timestamp: string,
  ) {
    super(`SSRF guard blocked request to ${blockedHostname}`);
    this.name = 'EgressBlockedError';
  }
}

// ─── Options ──────────────────────────────────────────────────────────────────

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

// ─── Private IP range helpers ─────────────────────────────────────────────────

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
const BLOCKED_CIDRS: Array<{ base: number; prefix: number; reason: string }> = [
  { base: ipv4ToInt('10.0.0.0'),      prefix: 8,  reason: 'RFC1918 private range 10.0.0.0/8' },
  { base: ipv4ToInt('172.16.0.0'),    prefix: 12, reason: 'RFC1918 private range 172.16.0.0/12' },
  { base: ipv4ToInt('192.168.0.0'),   prefix: 16, reason: 'RFC1918 private range 192.168.0.0/16' },
  { base: ipv4ToInt('127.0.0.0'),     prefix: 8,  reason: 'Loopback 127.0.0.0/8' },
  { base: ipv4ToInt('169.254.0.0'),   prefix: 16, reason: 'Link-local / cloud metadata 169.254.0.0/16' },
  { base: ipv4ToInt('0.0.0.0'),       prefix: 8,  reason: 'Reserved 0.0.0.0/8' },
  { base: ipv4ToInt('100.64.0.0'),    prefix: 10, reason: 'Shared address space 100.64.0.0/10' },
  { base: ipv4ToInt('192.0.0.0'),     prefix: 24, reason: 'IETF protocol assignments 192.0.0.0/24' },
  { base: ipv4ToInt('192.0.2.0'),     prefix: 24, reason: 'TEST-NET-1 192.0.2.0/24' },
  { base: ipv4ToInt('198.51.100.0'),  prefix: 24, reason: 'TEST-NET-2 198.51.100.0/24' },
  { base: ipv4ToInt('203.0.113.0'),   prefix: 24, reason: 'TEST-NET-3 203.0.113.0/24' },
  { base: ipv4ToInt('240.0.0.0'),     prefix: 4,  reason: 'Reserved 240.0.0.0/4' },
  { base: ipv4ToInt('255.255.255.255'), prefix: 32, reason: 'Broadcast' },
];

/**
 * Returns a block reason if the hostname is a blocked IPv4 literal, or null if allowed.
 * Pure function — no DNS calls.
 */
function checkIpv4Literal(hostname: string): string | null {
  const ip = ipv4ToInt(hostname);
  if (Number.isNaN(ip)) return null; // not an IPv4 literal — hostname will be validated at network layer

  for (const cidr of BLOCKED_CIDRS) {
    if (inCidr(ip, cidr.base, cidr.prefix)) {
      return cidr.reason;
    }
  }
  return null;
}

/**
 * Returns a block reason if the hostname is a blocked IPv6 literal, or null if allowed.
 */
function checkIpv6Literal(hostname: string): string | null {
  // Strip surrounding brackets used in URL notation: [::1]
  const h = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // Loopback
  if (h === '::1' || h === '::' || h.toLowerCase() === '0:0:0:0:0:0:0:1') {
    return 'IPv6 loopback ::1';
  }
  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(h)) {
    return 'IPv6 link-local fe80::/10';
  }
  // Unique local fc00::/7
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) {
    return 'IPv6 unique local fc00::/7';
  }
  return null;
}

// ─── Public: validateEgressUrl ────────────────────────────────────────────────

/**
 * Validate a URL before making any outbound request.
 *
 * Throws `EgressBlockedError` for:
 * - Non-HTTPS schemes (http, ftp, file, etc.)
 * - Private/loopback/link-local IPv4 literals
 * - Loopback/link-local/unique-local IPv6 literals
 * - `localhost` as a hostname
 *
 * Does NOT make any network call. Does NOT resolve DNS (not available in Workers).
 *
 * @throws {EgressBlockedError} if the URL is blocked.
 * @throws {TypeError} if the URL cannot be parsed.
 */
export async function validateEgressUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EgressBlockedError(
      url,
      'URL could not be parsed',
      new Date().toISOString(),
    );
  }

  // 1. Scheme must be https
  if (parsed.protocol !== 'https:') {
    throw new EgressBlockedError(
      parsed.hostname,
      `Non-HTTPS scheme "${parsed.protocol}" is not allowed`,
      new Date().toISOString(),
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Literal "localhost"
  if (hostname === 'localhost') {
    throw new EgressBlockedError(
      hostname,
      'Loopback hostname "localhost" is not allowed',
      new Date().toISOString(),
    );
  }

  // 3. IPv4 literal check
  const ipv4Block = checkIpv4Literal(hostname);
  if (ipv4Block !== null) {
    throw new EgressBlockedError(hostname, ipv4Block, new Date().toISOString());
  }

  // 4. IPv6 literal check
  const ipv6Block = checkIpv6Literal(hostname);
  if (ipv6Block !== null) {
    throw new EgressBlockedError(hostname, ipv6Block, new Date().toISOString());
  }

  // Hostname-based URLs (non-IP) pass this validation.
  // DNS rebinding mitigation must be handled at the Cloudflare network layer.
}

// ─── Private: retry helpers ───────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 480_000;

/**
 * Compute the next backoff delay with exponential growth + ±20% jitter.
 * Capped at `BACKOFF_CAP_MS`.
 */
function backoffMs(attempt: number): number {
  const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS);
  const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
  return Math.max(0, Math.floor(base + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public: egressRequest ────────────────────────────────────────────────────

/**
 * Make a hardened outbound HTTP request through the SSRF guard.
 *
 * - Validates the URL with `validateEgressUrl()` before any network call.
 * - Enforces a per-attempt timeout (default 30 s) via `AbortController`.
 * - Retries up to `maxRetries` times on network errors or HTTP 5xx, with
 *   exponential backoff (base 30 s, cap 480 s, ±20% jitter).
 * - Throws the last error after retry exhaustion.
 *
 * @throws {EgressBlockedError} if the URL is blocked by the SSRF guard.
 * @throws {Error} after all retry attempts are exhausted.
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
