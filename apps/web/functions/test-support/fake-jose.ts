/**
 * Deterministic stand-in for the `jose` module (ESM-only, so jest's CJS runtime cannot load it).
 *
 * Tokens round-trip the claims payload, so tests still exercise the real auth code paths
 * (`signAccessToken` / `verifyAccessToken` claim checks and failure handling) without depending
 * on crypto or module-format support. Used only through `jest.mock('jose', ...)`.
 */

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

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
    return `${HEADER}.${Buffer.from(JSON.stringify(this.payload)).toString('base64url')}`;
  }
}

export async function jwtVerify(token: string): Promise<{
  payload: Record<string, unknown>;
  protectedHeader: { alg: string };
}> {
  const parts = String(token).split('.');
  if (parts.length !== 2 || !parts[1]) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  if (!payload.sub) throw new Error('Invalid token payload');
  return { payload, protectedHeader: { alg: 'HS256' } };
}

export const SignJWT = FakeSignJWT;

export default { SignJWT: FakeSignJWT, jwtVerify };
