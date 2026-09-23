/**
 * Deterministic stand-in for the `jose` module (ESM-only, so jest's CJS runtime cannot load it).
 *
 * Tokens round-trip the claims payload, so tests still exercise the real auth code paths
 * (`signAccessToken` / `verifyAccessToken` claim checks and failure handling) without depending
 * on crypto or module-format support. Used only through `jest.mock('jose', ...)`.
 */

export function base64urlEncode(data: string): string {
  // Cloudflare Workers: no Buffer, use btoa + manual URL-safe encoding
  const utf8Bytes = new TextEncoder().encode(data);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64urlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - str.length % 4) % 4);
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

const HEADER = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export class FakeSignJWT {
  constructor(private readonly payload: Record<string, unknown>) {}

  setProtectedHeader(_header: Record<string, unknown>): this {
    return this;
  }

  setIssuedAt(_issuedAt?: number): this {
    return this;
  }

  setExpirationTime(_expirationTime: string | number): this {
    return this;
  }

  async sign(_secret: unknown): Promise<string> {
    return `${HEADER}.${base64urlEncode(JSON.stringify(this.payload))}`;
  }
}

export async function jwtVerify(token: string): Promise<{
  payload: Record<string, unknown>;
  protectedHeader: { alg: string };
}> {
  const parts = String(token).split('.');
  if (parts.length !== 2 || !parts[1]) throw new Error('Invalid token');
  const payload = JSON.parse(base64urlDecode(parts[1])) as Record<
    string,
    unknown
  >;
  if (!payload.sub) throw new Error('Invalid token payload');
  return { payload, protectedHeader: { alg: 'HS256' } };
}

export const SignJWT = FakeSignJWT;

export default { SignJWT: FakeSignJWT, jwtVerify };
