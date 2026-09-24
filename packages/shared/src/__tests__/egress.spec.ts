/**
 * TASK-01 Regression tests — shared SSRF-safe egress policy
 *
 * Covers every category required by the task spec:
 *   ✓ Public HTTPS — allowed
 *   ✓ HTTP (non-TLS) — blocked
 *   ✓ Unsupported protocol — blocked
 *   ✓ Loopback IPv4 (127.x) — blocked
 *   ✓ Loopback IPv6 (::1) — blocked
 *   ✓ Private IPv4: 10.x, 172.16-31.x, 192.168.x — blocked
 *   ✓ Link-local / cloud metadata (169.254.169.254, 100.100.x.x) — blocked
 *   ✓ Cloud metadata hostnames — blocked
 *   ✓ .local mDNS TLD — blocked
 *   ✓ Unspecified 0.0.0.0 — blocked
 *   ✓ Private IPv6: ::, fc00::/7 (fc/fd), fe80::/10 — blocked
 *   ✓ IPv4-mapped IPv6 targeting private range — blocked
 *   ✓ Invalid / unparseable URL — blocked
 *   ✓ safeFetch — blocks on initial URL
 *   ✓ safeFetch — blocks redirect to private URL (DNS-rebinding protection)
 *   ✓ safeFetch — follows safe redirects
 *   ✓ safeFetch — throws SsrfError with blockedUrl populated
 *   ✓ safeFetch — enforces max-redirect limit
 */

// The egress module lives in the web functions tree, not packages/shared.
// We import it via a relative path so the shared test runner can reach it
// without requiring a separate package.json dependency.
import {
  isSafeEgressTarget,
  safeFetch,
  SsrfError,
} from '../../../../apps/web/functions/shared/egress';

// ---------------------------------------------------------------------------
// isSafeEgressTarget — unit tests
// ---------------------------------------------------------------------------

describe('isSafeEgressTarget — public HTTPS allowed', () => {
  it.each([
    'https://api.example.com/data',
    'https://api.example.com',
    'https://acme-corp.io/v2/enterprise',
    'https://1.1.1.1',                       // Cloudflare DNS — public IPv4
    'https://8.8.8.8',                        // Google DNS — public IPv4
    'https://[2606:4700:4700::1111]',         // Cloudflare DNS — public IPv6 (brackets required)
  ])('allows %s', (url) => {
    expect(isSafeEgressTarget(url)).toEqual({ safe: true });
  });
});

describe('isSafeEgressTarget — HTTP blocked', () => {
  it.each([
    'http://api.example.com/data',
    'http://example.com',
    'http://1.1.1.1',
  ])('blocks %s', (url) => {
    const result = isSafeEgressTarget(url);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/http/i);
  });
});

describe('isSafeEgressTarget — unsupported protocol blocked', () => {
  it.each([
    'ftp://example.com/file',
    'file:///etc/passwd',
    'gopher://example.com',
    'ws://example.com',
    'wss://example.com/socket',
  ])('blocks %s', (url) => {
    const result = isSafeEgressTarget(url);
    expect(result.safe).toBe(false);
  });
});

describe('isSafeEgressTarget — loopback blocked', () => {
  it.each([
    'https://localhost',
    'https://localhost:8080/api',
    'https://127.0.0.1',
    'https://127.0.0.1:3000/health',
    'https://127.255.255.255',
    'https://[::1]',
    'https://[::1]:9000',
  ])('blocks %s', (url) => {
    expect(isSafeEgressTarget(url).safe).toBe(false);
  });
});

describe('isSafeEgressTarget — private IPv4 ranges blocked', () => {
  it.each([
    // 10.0.0.0/8
    'https://10.0.0.1',
    'https://10.100.200.50',
    'https://10.255.255.255',
    // 172.16.0.0/12
    'https://172.16.0.1',
    'https://172.20.0.1',
    'https://172.31.255.255',
    // 192.168.0.0/16
    'https://192.168.0.1',
    'https://192.168.1.100',
    'https://192.168.255.255',
  ])('blocks %s', (url) => {
    expect(isSafeEgressTarget(url).safe).toBe(false);
  });

  it('does NOT block 172.15.x (just outside private range)', () => {
    expect(isSafeEgressTarget('https://172.15.0.1').safe).toBe(true);
  });

  it('does NOT block 172.32.x (just outside private range)', () => {
    expect(isSafeEgressTarget('https://172.32.0.1').safe).toBe(true);
  });
});

describe('isSafeEgressTarget — link-local and cloud metadata blocked', () => {
  it.each([
    // AWS/GCP IMDS
    'https://169.254.169.254',
    'https://169.254.169.254/latest/meta-data',
    'https://169.254.169.254/computeMetadata/v1/',
    // Any 169.254.x link-local
    'https://169.254.0.1',
    'https://169.254.100.200',
    // Alibaba Cloud metadata
    'https://100.100.100.200',
    'https://100.100.0.1',
    // Hostname-based metadata
    'https://metadata.google.internal',
    'https://metadata.internal',
  ])('blocks %s', (url) => {
    expect(isSafeEgressTarget(url).safe).toBe(false);
  });
});

describe('isSafeEgressTarget — mDNS .local TLD blocked', () => {
  it.each([
    'https://printer.local',
    'https://myserver.local/api',
    'https://nas.local:8080',
  ])('blocks %s', (url) => {
    expect(isSafeEgressTarget(url).safe).toBe(false);
  });
});

describe('isSafeEgressTarget — unspecified address blocked', () => {
  it('blocks 0.0.0.0', () => {
    expect(isSafeEgressTarget('https://0.0.0.0').safe).toBe(false);
  });
});

describe('isSafeEgressTarget — private IPv6 blocked', () => {
  it.each([
    'https://[::1]',                       // loopback
    'https://[::]',                        // unspecified
    'https://[fe80::1]',                   // link-local
    'https://[fe80::1%25eth0]',            // link-local with zone ID (URL-encoded %)
    'https://[fc00::1]',                   // ULA private
    'https://[fd00::1]',                   // ULA private
    'https://[fdab:cdef:1234::1]',         // ULA private
  ])('blocks %s', (url) => {
    expect(isSafeEgressTarget(url).safe).toBe(false);
  });

  it('allows public IPv6 unicast (2000::/3)', () => {
    expect(isSafeEgressTarget('https://[2606:4700::6810:f8f8]').safe).toBe(true);
  });
});

describe('isSafeEgressTarget — IPv4-mapped IPv6 blocked when private', () => {
  // Browsers and Node normalise ::ffff:192.168.1.1 → ::ffff:c0a8:101 (hex groups).
  // egress.ts decodes both forms. Tests use the bracketed URL form required by URL().
  it.each([
    'https://[::ffff:192.168.1.1]',
    'https://[::ffff:10.0.0.1]',
    'https://[::ffff:172.16.0.1]',
    'https://[::ffff:127.0.0.1]',
  ])('blocks IPv4-mapped %s', (url) => {
    expect(isSafeEgressTarget(url).safe).toBe(false);
  });

  it('allows IPv4-mapped public address (::ffff:1.1.1.1)', () => {
    // Node normalises to ::ffff:101:101 — should be allowed
    expect(isSafeEgressTarget('https://[::ffff:1.1.1.1]').safe).toBe(true);
  });
});

describe('isSafeEgressTarget — invalid URL blocked', () => {
  it.each([
    '',
    'not-a-url',
    'example.com/no-scheme',
    'javascript:alert(1)',
  ])('blocks %p', (url) => {
    expect(isSafeEgressTarget(url).safe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// safeFetch — redirect safety
// ---------------------------------------------------------------------------

describe('safeFetch — redirect safety', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /**
   * Wrap a fetch mock so that DoH queries (1.1.1.1/dns-query) always return
   * a safe public IP, and the real upstream call uses the provided mock.
   * This keeps the redirect tests focused on redirect logic, not DoH.
   */
  function withDoHPassthrough(upstreamMock: jest.Mock): jest.Mock {
    return jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes('1.1.1.1/dns-query')) {
        // Return a safe public IP so DoH never blocks
        return Promise.resolve(
          new Response(JSON.stringify({ Answer: [{ type: 1, data: '1.2.3.4', TTL: 60 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/dns-json' },
          }),
        );
      }
      return upstreamMock(url, opts);
    });
  }

  it('passes through a direct safe response', async () => {
    const upstream = jest.fn().mockResolvedValueOnce(
      new Response('{"ok":true}', { status: 200 }),
    );
    global.fetch = withDoHPassthrough(upstream);
    const res = await safeFetch('https://api.example.com/data');
    expect(res.status).toBe(200);
    // Verify upstream called with redirect: 'manual'
    expect(upstream.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('throws SsrfError for a blocked initial URL', async () => {
    global.fetch = jest.fn();
    await expect(safeFetch('https://192.168.1.1/api')).rejects.toBeInstanceOf(SsrfError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws SsrfError when a redirect leads to a private IP (DNS-rebinding via Location)', async () => {
    const upstream = jest.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://169.254.169.254/latest/meta-data' },
      }),
    );
    global.fetch = withDoHPassthrough(upstream);
    const err = await safeFetch('https://api.example.com/redirect-me').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect((err as SsrfError).blockedUrl).toContain('169.254.169.254');
  });

  it('throws SsrfError when redirect leads to localhost', async () => {
    const upstream = jest.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: { Location: 'https://localhost/admin' },
      }),
    );
    global.fetch = withDoHPassthrough(upstream);
    const err = await safeFetch('https://api.example.com/').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect((err as SsrfError).blockedUrl).toContain('localhost');
  });

  it('follows a safe redirect and returns the final response', async () => {
    const finalResponse = new Response('{"data":1}', { status: 200 });
    const upstream = jest.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { Location: 'https://cdn.example.com/v2/data' },
        }),
      )
      .mockResolvedValueOnce(finalResponse);
    global.fetch = withDoHPassthrough(upstream);
    const res = await safeFetch('https://api.example.com/old');
    expect(res.status).toBe(200);
    // 2 upstream calls (initial + after redirect)
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('throws SsrfError after exceeding the max redirect limit', async () => {
    // Always return a redirect to a safe URL (DoH handled by passthrough)
    const upstream = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://api.example.com/loop' },
      }),
    );
    global.fetch = withDoHPassthrough(upstream);
    const err = await safeFetch('https://api.example.com/loop').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect((err as SsrfError).message).toMatch(/too many redirects/i);
    // MAX_REDIRECTS = 5, so 6 upstream calls (initial + 5 hops)
    expect(upstream).toHaveBeenCalledTimes(6);
  });

  it('SsrfError carries the blocked URL in blockedUrl field', async () => {
    global.fetch = jest.fn();
    const err = await safeFetch('https://10.0.0.1/internal').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect((err as SsrfError).blockedUrl).toBe('https://10.0.0.1/internal');
    expect((err as SsrfError).name).toBe('SsrfError');
  });

  it('throws SsrfError for http:// even via safeFetch', async () => {
    global.fetch = jest.fn();
    const err = await safeFetch('http://api.example.com').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// isSafeTcpHost — TCP connector host validation (IMAP / SFTP)
// ---------------------------------------------------------------------------

import { isSafeTcpHost, isSafeTcpPort } from '../../../../apps/web/functions/shared/egress';

describe('isSafeTcpHost — public hosts allowed', () => {
  it.each([
    'imap.gmail.com',
    'mail.example.com',
    'sftp.acme-corp.io',
    '1.1.1.1',
    '8.8.8.8',
  ])('allows %s', (host) => {
    expect(isSafeTcpHost(host)).toEqual({ safe: true });
  });
});

describe('isSafeTcpHost — private/metadata hosts blocked', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.100',
    '172.20.0.1',
    '169.254.169.254',
    '100.100.100.200',
    'metadata.google.internal',
    'metadata.internal',
    'mynas.local',
    '0.0.0.0',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12::1',
  ])('blocks %s', (host) => {
    expect(isSafeTcpHost(host).safe).toBe(false);
  });
});

describe('isSafeTcpHost — edge cases', () => {
  it('blocks empty string', () => {
    expect(isSafeTcpHost('').safe).toBe(false);
  });

  it('strips trailing dot (FQDN form)', () => {
    // imap.gmail.com. — trailing dot is valid FQDN syntax
    expect(isSafeTcpHost('imap.gmail.com.')).toEqual({ safe: true });
  });

  it('blocks IPv6 loopback with brackets', () => {
    expect(isSafeTcpHost('[::1]').safe).toBe(false);
  });
});

describe('isSafeTcpPort — valid ports allowed', () => {
  it.each([22, 143, 993, 587, 465, 8080, 443, 3000])('allows port %d', (port) => {
    expect(isSafeTcpPort(port)).toEqual({ safe: true });
  });
});

describe('isSafeTcpPort — dangerous/invalid ports blocked', () => {
  it.each([
    [0, 'zero'],
    [-1, 'negative'],
    [65536, 'above max'],
    [25, 'SMTP relay'],
    [3306, 'MySQL'],
    [5432, 'PostgreSQL'],
    [6379, 'Redis'],
    [27017, 'MongoDB'],
    [445, 'SMB'],
  ])('blocks port %d (%s)', (port) => {
    expect(isSafeTcpPort(port).safe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// safeFetch — DoH DNS-rebinding mitigation
// ---------------------------------------------------------------------------

describe('safeFetch — DoH DNS-rebinding check', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /**
   * Build a mock fetch that handles DoH queries and then the real upstream.
   * dohARecords: what to return for the A-record DoH query
   * upstreamStatus: status to return for the actual connector fetch
   */
  function mockWithDoh(
    hostname: string,
    dohARecords: string[],
    upstreamStatus = 200,
  ) {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      const u = String(url);
      // DoH A-record query
      if (u.includes('1.1.1.1/dns-query') && u.includes('type=A')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              Answer: dohARecords.map((ip) => ({ type: 1, name: hostname, data: ip, TTL: 60 })),
            }),
            { status: 200, headers: { 'Content-Type': 'application/dns-json' } },
          ),
        );
      }
      // DoH AAAA query — return empty
      if (u.includes('1.1.1.1/dns-query') && u.includes('type=AAAA')) {
        return Promise.resolve(
          new Response(JSON.stringify({ Answer: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/dns-json' },
          }),
        );
      }
      // Real upstream
      return Promise.resolve(new Response('{"ok":true}', { status: upstreamStatus }));
    });
  }

  it('allows a hostname resolving to a public IP', async () => {
    mockWithDoh('api.example.com', ['1.2.3.4']); // public IP
    const res = await safeFetch('https://api.example.com/data');
    expect(res.status).toBe(200);
  });

  it('blocks a hostname that resolves to a private IPv4 (10.x)', async () => {
    mockWithDoh('evil.attacker.com', ['10.0.0.1']); // private — DNS rebinding
    const err = await safeFetch('https://evil.attacker.com/').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect((err as SsrfError).message).toMatch(/DNS rebinding blocked/);
    expect((err as SsrfError).message).toMatch(/10\.0\.0\.1/);
  });

  it('blocks a hostname that resolves to 169.254.169.254 (AWS metadata)', async () => {
    mockWithDoh('metadata.evil.com', ['169.254.169.254']);
    const err = await safeFetch('https://metadata.evil.com/').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect((err as SsrfError).message).toMatch(/DNS rebinding blocked/);
  });

  it('blocks a hostname that resolves to 192.168.x (private RFC-1918)', async () => {
    mockWithDoh('internal.corp.com', ['192.168.1.100']);
    const err = await safeFetch('https://internal.corp.com/').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect((err as SsrfError).message).toMatch(/DNS rebinding blocked/);
  });

  it('allows fetch when DoH times out (fail-open)', async () => {
    // First two calls are DoH (A + AAAA) — simulate network error
    // Third call is the actual upstream
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) return Promise.reject(new Error('Network error'));
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    const res = await safeFetch('https://api.example.com/data');
    expect(res.status).toBe(200);
  });

  it('validates DoH on each redirect hop', async () => {
    // Hop 1: DoH resolves to public IP, redirects to second URL
    // Hop 2 DoH resolves to private IP — should block
    let dohCallCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('1.1.1.1/dns-query') && u.includes('type=A')) {
        dohCallCount++;
        const ip = dohCallCount === 1 ? '1.2.3.4' : '10.0.0.5'; // private on hop 2
        return Promise.resolve(
          new Response(JSON.stringify({ Answer: [{ type: 1, data: ip }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/dns-json' },
          }),
        );
      }
      if (u.includes('1.1.1.1/dns-query') && u.includes('type=AAAA')) {
        return Promise.resolve(
          new Response(JSON.stringify({ Answer: [] }), { status: 200 }),
        );
      }
      // First upstream — redirect to second
      if (u.includes('api.example.com')) {
        return Promise.resolve(
          new Response(null, {
            status: 301,
            headers: { Location: 'https://hop2.example.com/data' },
          }),
        );
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });

    const err = await safeFetch('https://api.example.com/start').catch((e) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect((err as SsrfError).message).toMatch(/DNS rebinding blocked/);
  });
});
