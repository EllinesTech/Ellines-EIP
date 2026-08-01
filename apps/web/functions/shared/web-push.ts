/**
 * Web Push (VAPID) for Pages Functions.
 * No VAPID secrets → caller keeps `simulated`.
 * Payload-less push (RFC 8030) + VAPID JWT — works on Workers via Web Crypto + jose.
 */

export type WebPushEnv = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  ELLINEA_VAPID_PUBLIC_KEY?: string;
  ELLINEA_VAPID_PRIVATE_KEY?: string;
  ELLINEA_VAPID_SUBJECT?: string;
};

export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type PushSendResult =
  | { ok: true }
  | { ok: false; error: string };

function pick(a?: string, b?: string): string {
  return (a || b || '').trim();
}

export function resolveVapidConfig(env: WebPushEnv): VapidConfig | null {
  const publicKey = pick(env.VAPID_PUBLIC_KEY, env.ELLINEA_VAPID_PUBLIC_KEY);
  const privateKey = pick(env.VAPID_PRIVATE_KEY, env.ELLINEA_VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) return null;
  const subject =
    pick(env.VAPID_SUBJECT, env.ELLINEA_VAPID_SUBJECT) || 'mailto:noreply@ellines.co.ke';
  return { publicKey, privateKey, subject };
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importVapidSigningKey(
  publicKeyB64: string,
  privateKeyB64: string,
): Promise<CryptoKey> {
  const pub = b64urlToBytes(publicKeyB64);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID public key must be uncompressed P-256 (65 bytes)');
  }
  const d = b64urlToBytes(privateKeyB64);
  if (d.length !== 32) {
    throw new Error('VAPID private key must be 32-byte P-256 scalar');
  }
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: bytesToB64url(d),
  };
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

function audienceFromEndpoint(endpoint: string): string {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.host}`;
}

export function normalizePushSubscription(raw: unknown): PushSubscriptionJSON | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const endpoint = typeof o.endpoint === 'string' ? o.endpoint.trim() : '';
  const keys = o.keys && typeof o.keys === 'object' && !Array.isArray(o.keys)
    ? (o.keys as Record<string, unknown>)
    : null;
  const p256dh = keys && typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = keys && typeof keys.auth === 'string' ? keys.auth.trim() : '';
  if (!endpoint.startsWith('https://') || !p256dh || !auth) return null;
  return {
    endpoint: endpoint.slice(0, 2048),
    expirationTime: typeof o.expirationTime === 'number' ? o.expirationTime : null,
    keys: { p256dh: p256dh.slice(0, 200), auth: auth.slice(0, 200) },
  };
}

/** Payload-less Web Push with VAPID — wakes the SW; client shows notification. */
export async function sendWebPush(
  env: WebPushEnv,
  subscription: PushSubscriptionJSON,
  _hint?: { title?: string; body?: string },
): Promise<PushSendResult> {
  const vapid = resolveVapidConfig(env);
  if (!vapid) {
    return { ok: false, error: 'VAPID keys not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).' };
  }

  try {
    const jose = await import('jose');
    const key = await importVapidSigningKey(vapid.publicKey, vapid.privateKey);
    const audience = audienceFromEndpoint(subscription.endpoint);
    const jwt = await new jose.SignJWT({ sub: vapid.subject })
      .setProtectedHeader({ typ: 'JWT', alg: 'ES256' })
      .setAudience(audience)
      .setExpirationTime('12h')
      .setIssuedAt()
      // jose KeyInput vs Workers CryptoKey `type: string` mismatch
      .sign(key as never);

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        TTL: '120',
        Urgency: 'normal',
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      },
    });

    if (res.status === 201 || res.status === 202 || res.status === 204) {
      return { ok: true };
    }
    if (res.status === 404 || res.status === 410) {
      return { ok: false, error: `Subscription gone (HTTP ${res.status}) — re-subscribe in Delivery policy.` };
    }
    const text = (await res.text()).slice(0, 180);
    return { ok: false, error: `Push service HTTP ${res.status}${text ? `: ${text}` : ''}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Web Push failed';
    return { ok: false, error: msg.slice(0, 300) };
  }
}
