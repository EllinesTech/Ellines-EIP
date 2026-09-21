/**
 * Tenant secret encryption for Cloudflare Pages Functions.
 *
 * Current format: AES-256-GCM + HKDF(SHA-256)
 * Key material: EIP_ENCRYPTION_MASTER_KEY (secret; never tenant-controlled)
 * Context: organization ID is used as HKDF info and AES-GCM associated data.
 *
 * Version 2 is fail-closed: missing/invalid secrets or authentication failures
 * throw instead of returning plaintext/Base64 or an empty string.
 */

const CURRENT_VERSION = 2;
const MASTER_KEY_ENV = 'EIP_ENCRYPTION_MASTER_KEY';

function requireMasterSecret(env: { EIP_ENCRYPTION_MASTER_KEY?: string }): string {
  const secret = env.EIP_ENCRYPTION_MASTER_KEY?.trim();
  if (!secret) throw new Error(MASTER_KEY_ENV + ' is required');
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < 32) throw new Error(MASTER_KEY_ENV + ' must contain at least 32 UTF-8 bytes');
  return secret;
}

function b64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromB64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function deriveV2Key(env: { EIP_ENCRYPTION_MASTER_KEY?: string }, organizationId: string): Promise<CryptoKey> {
  const master = new TextEncoder().encode(requireMasterSecret(env));
  const base = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('ellines-eip:encryption:v2'),
      info: new TextEncoder().encode('organization:' + organizationId),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Legacy v1 key derivation, retained only for explicit migration. */
async function deriveLegacyV1Key(organizationId: string): Promise<CryptoKey> {
  const data = new TextEncoder().encode('org:' + organizationId);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(
  plaintext: string,
  organizationId: string,
  env: { EIP_ENCRYPTION_MASTER_KEY?: string },
): Promise<string> {
  if (!organizationId) throw new Error('organizationId is required');
  const key = await deriveV2Key(env, organizationId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(organizationId);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );
  return JSON.stringify({
    encrypted: true,
    version: CURRENT_VERSION,
    algorithm: 'AES-256-GCM',
    kdf: 'HKDF-SHA-256',
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(ciphertext)),
  });
}

async function decryptLegacyV1(encryptedData: Record<string, unknown>, organizationId: string): Promise<string> {
  const key = await deriveLegacyV1Key(organizationId);
  const iv = fromB64(String(encryptedData.iv || ''));
  const ciphertext = fromB64(String(encryptedData.ciphertext || ''));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export async function decrypt(
  encrypted: string,
  organizationId: string,
  env: { EIP_ENCRYPTION_MASTER_KEY?: string },
): Promise<string> {
  if (!encrypted || !organizationId) throw new Error('Encrypted value and organizationId are required');

  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(encrypted);
    if (!parsed || typeof parsed !== 'object' || parsed.encrypted !== true) {
      throw new Error('Unsupported encrypted value');
    }
    data = parsed as Record<string, unknown>;
  } catch {
    throw new Error('Encrypted value is not a supported EIP encryption envelope');
  }

  const version = Number(data.version);
  if (version === 1) {
    // Temporary compatibility path. Call migrateToEncryption before persisting again.
    return decryptLegacyV1(data, organizationId);
  }
  if (version !== CURRENT_VERSION) throw new Error('Unsupported encryption version: ' + String(data.version));

  const key = await deriveV2Key(env, organizationId);
  const iv = fromB64(String(data.iv || ''));
  const ciphertext = fromB64(String(data.ciphertext || ''));
  const aad = new TextEncoder().encode(organizationId);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

export function isEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return Boolean(parsed && typeof parsed === 'object' && parsed.encrypted === true && Number(parsed.version) >= 1);
  } catch {
    return false;
  }
}

/**
 * Explicit migration helper.
 * Handles:
 * - v1 EIP JSON encryption;
 * - legacy Base64 storage;
 * - plaintext only when explicitly supplied to the migration command.
 *
 * It never returns a Base64/plaintext value as an encrypted result.
 */
export async function migrateToEncryption(
  value: string,
  organizationId: string,
  env: { EIP_ENCRYPTION_MASTER_KEY?: string },
): Promise<string> {
  if (!value) throw new Error('Cannot migrate an empty secret');
  if (!organizationId) throw new Error('organizationId is required');

  if (isEncrypted(value)) {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (Number(parsed.version) === CURRENT_VERSION) {
      // Validate that the current master key can decrypt it before accepting it.
      await decrypt(value, organizationId, env);
      return value;
    }
    const plaintext = await decrypt(value, organizationId, env);
    return encrypt(plaintext, organizationId, env);
  }

  let plaintext: string;
  try {
    plaintext = new TextDecoder().decode(fromB64(value));
    if (!plaintext) throw new Error('empty');
  } catch {
    plaintext = value;
  }
  return encrypt(plaintext, organizationId, env);
}
