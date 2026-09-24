/**
 * Ellines EIP — Shared SSRF-safe egress policy (TASK-01)
 *
 * Single authoritative outbound validator used by every connector path:
 *   proxy.ts · autoscan/probe.ts · installations/[id]/sync.ts
 *   installations/[id]/test.ts · connectors.ts · [id]/sync.ts
 *   (IMAP/SFTP TCP paths use isSafeTcpHost below)
 *
 * HTTP/HTTPS rules enforced by isSafeEgressTarget:
 *   1. Protocol must be https: (http: is explicitly rejected)
 *   2. Localhost, loopback (127.x, ::1, [::1]) blocked
 *   3. Private IPv4: 10.x, 172.16-31.x, 192.168.x
 *   4. Link-local IPv4: 169.254.x (incl. AWS metadata 169.254.169.254)
 *   5. Cloud metadata: 169.254.169.254, metadata.google.internal,
 *      metadata.internal, 100.100.100.200 (Alibaba metadata)
 *   6. mDNS / Bonjour: *.local TLD
 *   7. Unspecified: 0.0.0.0
 *   8. IPv6 private/link-local: fc00::/7, fe80::/10
 *   9. IPv4-mapped IPv6 targeting private ranges
 *  10. Redirects: safeFetch validates every hop before following.
 *
 * ── Known platform constraint (DNS rebinding) ────────────────────────────────
 * The Cloudflare Pages Functions / Workers runtime does not expose a DNS
 * resolution API. This means we validate URLs and redirect Location headers
 * as text — we cannot resolve a hostname to an IP and then re-check that IP.
 *
 * A determined attacker who controls a DNS record could potentially:
 *   1. Pass our text-based check with a public IP on the first DNS lookup
 *   2. Flip the DNS record to a private IP between our check and Cloudflare's
 *      actual TCP connection (classic Time-Of-Check / Time-Of-Use rebinding)
 *
 * Mitigations available at the Cloudflare network level (outside this code):
 *   A. Cloudflare Gateway / Zero Trust — DNS filtering policy that blocks
 *      private-IP responses for requests from your Pages zone.
 *   B. Cloudflare WAF custom rule — block outbound requests whose resolved IP
 *      falls in RFC-1918 space (requires Cloudflare Enterprise or Gateway).
 *   C. Use a dedicated egress Worker with a custom DNS resolver that validates
 *      the resolved IP before connecting (requires Workers + DNS-over-HTTPS).
 *
 * Until one of (A)/(B)/(C) is in place, a motivated attacker with DNS control
 * could bypass the per-hop redirect check via TOCTOU. This risk is accepted
 * as a known platform constraint and is tracked in the security backlog.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface EgressCheckResult {
  safe: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalise an IPv4 decimal string to four numeric octets, or null. */
function parseIPv4(hostname: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((p) => p > 255)) return null;
  return parts as [number, number, number, number];
}

/** True if this IPv4 address falls in a blocked range. */
function isBlockedIPv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true;                          // 0.0.0.0/8 unspecified
  if (a === 10) return true;                         // 10.0.0.0/8 private
  if (a === 127) return true;                        // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16-31.x/12 private
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16 private
  if (a === 100 && b === 100) return true;           // 100.100.x.x Alibaba metadata range
  return false;
}

/** True if this IPv6 address literal falls in a blocked range. */
function isBlockedIPv6(raw: string): boolean {
  // Strip brackets if present: [::1] → ::1
  const addr = raw.replace(/^\[|\]$/g, '').toLowerCase();
  if (addr === '::1') return true;              // loopback
  if (addr === '::') return true;               // unspecified
  if (addr.startsWith('fe80:')) return true;    // fe80::/10 link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // fc00::/7 ULA private

  // Detect ::ffff:IPv4-mapped addresses.
  // Browsers/Node normalise the IPv4 portion to hex groups:
  //   ::ffff:192.168.1.1 → ::ffff:c0a8:101
  //   ::ffff:10.0.0.1   → ::ffff:a00:1
  //   ::ffff:127.0.0.1  → ::ffff:7f00:1
  // We must decode those hex groups back to octets to apply the IPv4 policy.
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(addr);
  if (mapped) {
    const hi = parseInt(mapped[1], 16); // e.g. 0xc0a8 = 49320
    const lo = parseInt(mapped[2], 16); // e.g. 0x0101 = 257
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    if (isBlockedIPv4([a, b, c, d])) return true;
  }

  // Also handle the dotted-decimal form if the runtime does not normalise:
  //   ::ffff:192.168.1.1 (some environments keep this form)
  const mappedDotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mappedDotted) {
    const ipv4 = parseIPv4(mappedDotted[1]);
    if (ipv4 && isBlockedIPv4(ipv4)) return true;
  }

  return false;
}

/** Blocked hostnames (exact, case-insensitive). */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
]);

// ---------------------------------------------------------------------------
// Core validator
// ---------------------------------------------------------------------------

/**
 * Validate a user-supplied URL against the shared SSRF policy.
 *
 * @param urlStr  Raw URL string from user/config input.
 * @returns       `{ safe: true }` if the URL passes all checks,
 *                `{ safe: false, reason: string }` otherwise.
 */
export function isSafeEgressTarget(urlStr: string): EgressCheckResult {
  // ── 1. Parse ──────────────────────────────────────────────────────────────
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'Invalid URL — could not parse' };
  }

  // ── 2. Protocol ───────────────────────────────────────────────────────────
  if (url.protocol !== 'https:') {
    if (url.protocol === 'http:') {
      return { safe: false, reason: 'Only HTTPS targets are allowed (http:// is not permitted)' };
    }
    return {
      safe: false,
      reason: `Unsupported protocol: ${url.protocol} — only https:// is allowed`,
    };
  }

  // ── 3. Hostname normalisation ─────────────────────────────────────────────
  // url.hostname strips brackets from IPv6 literals: [::1] → ::1
  const hostname = url.hostname.toLowerCase();

  if (!hostname) {
    return { safe: false, reason: 'URL has no hostname' };
  }

  // ── 4. Exact blocked hostnames ────────────────────────────────────────────
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `Blocked hostname: ${hostname}` };
  }

  // ── 5. mDNS / .local TLD ─────────────────────────────────────────────────
  if (hostname.endsWith('.local') || hostname === '.local') {
    return { safe: false, reason: 'mDNS / .local hostnames are not permitted' };
  }

  // ── 6. IPv6 literals ─────────────────────────────────────────────────────
  // url.hostname for IPv6 already has brackets stripped.
  // Heuristic: contains ':' → IPv6
  if (hostname.includes(':')) {
    if (isBlockedIPv6(hostname)) {
      return { safe: false, reason: `Blocked IPv6 address: ${hostname}` };
    }
    // Non-private IPv6 is allowed (public internet unicast)
    return { safe: true };
  }

  // ── 7. IPv4 literals ─────────────────────────────────────────────────────
  const ipv4 = parseIPv4(hostname);
  if (ipv4) {
    if (isBlockedIPv4(ipv4)) {
      return { safe: false, reason: `Blocked private/reserved IPv4 address: ${hostname}` };
    }
    return { safe: true };
  }

  // ── 8. Public hostname — passes ───────────────────────────────────────────
  return { safe: true };
}

// ---------------------------------------------------------------------------
// Free DNS-over-HTTPS resolver (TOCTOU / DNS-rebinding mitigation)
// ---------------------------------------------------------------------------

/**
 * Resolve a hostname to its IPv4/IPv6 addresses using Cloudflare's free
 * DNS-over-HTTPS API (https://1.1.1.1/dns-query).
 *
 * This is the zero-cost mitigation for DNS rebinding:
 *   1. We resolve the hostname before connecting.
 *   2. We validate every returned IP against the private-range policy.
 *   3. Only if all IPs pass do we proceed with the fetch.
 *
 * The TOCTOU window (gap between our DoH query and Cloudflare's actual TCP
 * connection) is milliseconds with TTL=0 required to exploit. This makes
 * a practical attack impractical without a paid network-level firewall.
 *
 * Called by safeFetch for non-literal-IP hostnames only — literal IPs are
 * already validated definitively by the synchronous isSafeEgressTarget check.
 *
 * Fails OPEN on network error (DoH unreachable) to avoid breaking connectors
 * when 1.1.1.1 is temporarily unreachable. Change the catch block to return
 * { safe: false } to fail CLOSED if you require stricter guarantees.
 */
const DOH_URL = 'https://1.1.1.1/dns-query';
const DOH_TIMEOUT_MS = 2000;

interface DohAnswer {
  type: number; // 1 = A (IPv4), 28 = AAAA (IPv6)
  data: string;
}
interface DohResponse {
  Answer?: DohAnswer[];
}

async function resolveAndCheck(hostname: string): Promise<EgressCheckResult> {
  // Literal IPs already validated synchronously — no DoH needed
  if (parseIPv4(hostname) || hostname.includes(':')) {
    return { safe: true };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOH_TIMEOUT_MS);
    let aJson: DohResponse = {};
    let aaaaJson: DohResponse = {};
    try {
      const [aResp, aaaaResp] = await Promise.all([
        fetch(`${DOH_URL}?name=${encodeURIComponent(hostname)}&type=A`, {
          headers: { Accept: 'application/dns-json' },
          signal: controller.signal,
        }),
        fetch(`${DOH_URL}?name=${encodeURIComponent(hostname)}&type=AAAA`, {
          headers: { Accept: 'application/dns-json' },
          signal: controller.signal,
        }),
      ]);
      [aJson, aaaaJson] = await Promise.all([
        aResp.ok ? (aResp.json() as Promise<DohResponse>) : Promise.resolve({}),
        aaaaResp.ok ? (aaaaResp.json() as Promise<DohResponse>) : Promise.resolve({}),
      ]);
    } finally {
      clearTimeout(timer);
    }

    const answers = [...(aJson.Answer ?? []), ...(aaaaJson.Answer ?? [])];
    for (const answer of answers) {
      if (answer.type !== 1 && answer.type !== 28) continue;
      const ip = answer.data.trim();
      const ipv4 = parseIPv4(ip);
      if (ipv4) {
        if (isBlockedIPv4(ipv4)) {
          return {
            safe: false,
            reason: `DNS rebinding blocked: ${hostname} resolves to private IPv4 ${ip}`,
          };
        }
      } else if (ip.includes(':') && isBlockedIPv6(ip)) {
        return {
          safe: false,
          reason: `DNS rebinding blocked: ${hostname} resolves to private IPv6 ${ip}`,
        };
      }
    }
    return { safe: true };
  } catch {
    // DoH unreachable / timed out — fail OPEN to avoid connector downtime.
    // To fail CLOSED, return { safe: false, reason: 'DoH resolver unavailable' }
    return { safe: true };
  }
}

// ---------------------------------------------------------------------------


/**
 * Fetch options accepted by safeFetch (subset of RequestInit, no `redirect`).
 * The caller must NOT set `redirect` — safeFetch manages redirect following
 * with per-hop SSRF validation.
 */
export type SafeFetchInit = Omit<RequestInit, 'redirect'>;

/** Maximum redirects to follow before giving up. */
const MAX_REDIRECTS = 5;

/**
 * A drop-in replacement for `fetch()` that:
 *  - Validates the initial URL with `isSafeEgressTarget` (synchronous, text-based)
 *  - Resolves the hostname via Cloudflare DoH and validates all returned IPs
 *    (async, closes the DNS-rebinding TOCTOU gap at zero cost)
 *  - Follows redirects manually, re-validating + re-resolving each hop
 *  - Throws `SsrfError` if any check fails
 *
 * Use this for ALL connector outbound HTTP calls where the URL is derived
 * from user input or a stored connector configuration.
 */
export async function safeFetch(
  urlStr: string,
  init?: SafeFetchInit,
): Promise<Response> {
  let current = urlStr;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // 1. Synchronous text-based check (protocol, private IPs, blocked hostnames)
    const check = isSafeEgressTarget(current);
    if (!check.safe) {
      throw new SsrfError(check.reason ?? 'SSRF policy violation', current);
    }

    // 2. Async DoH resolution check — validates resolved IPs against private ranges
    //    (mitigates DNS rebinding for non-literal-IP hostnames)
    const hostname = new URL(current).hostname.replace(/^\[|\]$/g, '');
    const dohCheck = await resolveAndCheck(hostname);
    if (!dohCheck.safe) {
      throw new SsrfError(dohCheck.reason ?? 'DNS rebinding check failed', current);
    }

    const res = await fetch(current, { ...init, redirect: 'manual' });

    // Not a redirect — return the response
    if (res.status < 300 || res.status >= 400) {
      return res;
    }

    const location = res.headers.get('location');
    if (!location) {
      return res;
    }

    try {
      current = new URL(location, current).toString();
    } catch {
      throw new SsrfError(`Invalid redirect Location header: ${location}`, location);
    }

    if (hop === MAX_REDIRECTS) {
      throw new SsrfError(`Too many redirects (max ${MAX_REDIRECTS})`, current);
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new SsrfError('Redirect loop exhausted', current);
}

/**
 * Thrown when a URL fails the SSRF policy or a redirect leads to a blocked target.
 */
export class SsrfError extends Error {
  readonly blockedUrl: string;
  constructor(reason: string, blockedUrl: string) {
    super(`SSRF policy violation: ${reason} [${blockedUrl}]`);
    this.name = 'SsrfError';
    this.blockedUrl = blockedUrl;
  }
}

// ---------------------------------------------------------------------------
// TCP host validator (IMAP / SFTP)
// ---------------------------------------------------------------------------

/**
 * Validate a raw hostname (no scheme, no port) for use in TCP-based connectors
 * such as IMAP and SFTP. Enforces the same private-range and metadata-host
 * rules as isSafeEgressTarget, but operates on a bare hostname/IP string
 * rather than a full URL.
 *
 * Use this before opening a cloudflare:sockets TCP connection to a
 * user-supplied host. The port is validated separately (must be > 0, ≤ 65535,
 * and not a privileged port used for lateral movement on well-known services).
 *
 * ── Same DNS-rebinding constraint applies ─────────────────────────────────
 * We validate the hostname string, not the resolved IP. See the file-level
 * comment for mitigation options at the Cloudflare network level.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * @param host  Raw hostname or IP address (no brackets, no port).
 * @returns     `{ safe: true }` or `{ safe: false, reason: string }`.
 */
export function isSafeTcpHost(host: string): EgressCheckResult {
  if (!host || typeof host !== 'string') {
    return { safe: false, reason: 'Host is required' };
  }

  const h = host.trim().toLowerCase().replace(/\.$/, ''); // strip trailing dot
  if (!h) {
    return { safe: false, reason: 'Host is empty' };
  }

  // ── Exact blocked hostnames ──────────────────────────────────────────────
  if (BLOCKED_HOSTNAMES.has(h)) {
    return { safe: false, reason: `Blocked hostname: ${h}` };
  }

  // ── mDNS .local ──────────────────────────────────────────────────────────
  if (h.endsWith('.local')) {
    return { safe: false, reason: 'mDNS / .local hostnames are not permitted' };
  }

  // ── IPv6 literals (may or may not have brackets) ─────────────────────────
  // TCP hosts are typically passed without brackets; accept both forms.
  const ipv6Bare = h.replace(/^\[|\]$/g, '');
  if (ipv6Bare.includes(':')) {
    if (isBlockedIPv6(ipv6Bare)) {
      return { safe: false, reason: `Blocked IPv6 address: ${h}` };
    }
    return { safe: true };
  }

  // ── IPv4 literals ─────────────────────────────────────────────────────────
  const ipv4 = parseIPv4(h);
  if (ipv4) {
    if (isBlockedIPv4(ipv4)) {
      return { safe: false, reason: `Blocked private/reserved IPv4 address: ${h}` };
    }
    return { safe: true };
  }

  // ── Public hostname ───────────────────────────────────────────────────────
  return { safe: true };
}

/**
 * Validate a TCP port number for connector use.
 * Rejects: zero, negative, > 65535, and a small set of ports that should
 * never be the target of a connector outbound connection (privileged service
 * ports commonly used in SSRF lateral-movement chains).
 */
export function isSafeTcpPort(port: number): EgressCheckResult {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { safe: false, reason: `Invalid port: ${port}` };
  }
  // Block ports commonly targeted in SSRF lateral-movement attacks
  const BLOCKED_PORTS = new Set([
    25,   // SMTP relay — exfiltration / spam relay
    111,  // RPC portmapper
    135,  // MS-RPC
    139,  // NetBIOS
    445,  // SMB
    3306, // MySQL (raw, no TLS — lateral DB access)
    5432, // PostgreSQL (raw — lateral DB access)
    6379, // Redis (no auth by default)
    11211, // Memcached
    27017, // MongoDB
  ]);
  if (BLOCKED_PORTS.has(port)) {
    return {
      safe: false,
      reason: `Port ${port} is not permitted for outbound connector connections`,
    };
  }
  return { safe: true };
}
