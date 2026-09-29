/**
 * Ellines EIP — Credential Encryption
 *
 * AES-256-GCM encryption for connector credentials and other sensitive fields.
 * Uses the Web Crypto API (SubtleCrypto) — compatible with Cloudflare Workers
 * and Node.js 18+. No Node.js `crypto` module is used.
 *
 * Key derivation: HKDF with SHA-256, using `EIP_ENCRYPTION_MASTER_KEY` as the
 * input key material and `orgId` as the info/salt so each tenant gets a distinct
 * derived key from the same master secret.
 *
 * Wire format (base64-encoded):
 *   [ 12-byte IV ][ ciphertext (arbitrary length) ][ 16-byte GCM auth tag ]
 * The auth tag is appended automatically by SubtleCrypto's AES-GCM implementation.
 */

/**
 * Minimal Env shape required by this module. Compatible with the full Env
 * interface in `apps/web/functions/shared/auth.ts`.
 */
export interface EncryptionEnv {
  /** 256-bit+ master secret — set as EIP_ENCRYPTION_MASTER_KEY in Cloudflare Pages. */
  EIP_ENCRYPTION_MASTER_KEY?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const GCM_IV_BYTES = 12;     // 96-bit IV recommended for AES-GCM
const GCM_TAG_BITS = 128;    // 128-bit authentication tag (SubtleCrypto default)

/**
 * Derive a 256-bit AES-GCM key from the master secret and a per-tenant salt.
 * Uses HKDF with SHA-256 so the derived key is cryptographically independent
 * per `orgId`, even if the master key is shared across tenants.
 */
async function deriveKey(masterKeyBase64: string, orgId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();

  // Import the raw master key bytes as an HKDF key.
  const masterBytes = base64ToBytes(masterKeyBase64);
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterBytes.buffer as ArrayBuffer,
    { name: 'HKDF' },
    false,              // not extractable
    ['deriveKey'],
  );

  // Derive a 256-bit AES-GCM key scoped to this org.
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('ellines-eip-v1'),   // fixed domain separator
      info: enc.encode(`org:${orgId}`),      // per-tenant binding
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,              // not extractable — key bytes never leave the crypto engine
    ['encrypt', 'decrypt'],
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  // btoa is available in both Workers and Node.js 18+.
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function requireMasterKey(env: EncryptionEnv): string {
  const key = env.EIP_ENCRYPTION_MASTER_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error('Encryption key is not configured');
  }
  return key.trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string.
 *
 * @param plaintext - The value to encrypt. Must be non-empty.
 * @param orgId     - Tenant identifier used to derive a tenant-scoped key.
 * @param env       - Cloudflare Workers env containing `EIP_ENCRYPTION_MASTER_KEY`.
 * @returns         Base64-encoded string: `<12-byte IV><ciphertext+tag>`.
 *
 * @throws If the encryption key is absent or derivation / encryption fails.
 *         Error messages never include the plaintext or key value.
 */
export async function encrypt(
  plaintext: string,
  orgId: string,
  env: EncryptionEnv,
): Promise<string> {
  if (!plaintext) {
    throw new Error('Plaintext must be non-empty');
  }
  if (!orgId) {
    throw new Error('orgId must be non-empty');
  }

  const masterKey = requireMasterKey(env);

  let key: CryptoKey;
  try {
    key = await deriveKey(masterKey, orgId);
  } catch {
    throw new Error('Failed to derive encryption key');
  }

  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const plaintextBytes = new TextEncoder().encode(plaintext);

  let ciphertextBuffer: ArrayBuffer;
  try {
    ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: GCM_TAG_BITS },
      key,
      plaintextBytes,
    );
  } catch {
    throw new Error('Encryption operation failed');
  }

  // Concatenate IV + ciphertext (which includes the 16-byte GCM auth tag).
  const ciphertext = new Uint8Array(ciphertextBuffer);
  const combined = new Uint8Array(GCM_IV_BYTES + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, GCM_IV_BYTES);

  return bytesToBase64(combined);
}

/**
 * Decrypt a ciphertext produced by `encrypt()`.
 *
 * @param ciphertext - Base64-encoded string as returned by `encrypt()`.
 * @param orgId      - Must match the `orgId` used during encryption.
 * @param env        - Cloudflare Workers env containing `EIP_ENCRYPTION_MASTER_KEY`.
 * @returns          The original plaintext string.
 *
 * @throws If the key is absent, the ciphertext is malformed, or authentication fails.
 *         Error messages never include the ciphertext or key value.
 */
export async function decrypt(
  ciphertext: string,
  orgId: string,
  env: EncryptionEnv,
): Promise<string> {
  if (!ciphertext) {
    throw new Error('Ciphertext must be non-empty');
  }
  if (!orgId) {
    throw new Error('orgId must be non-empty');
  }

  const masterKey = requireMasterKey(env);

  let combined: Uint8Array;
  try {
    combined = base64ToBytes(ciphertext);
  } catch {
    throw new Error('Ciphertext is not valid base64');
  }

  // Minimum valid length: IV (12) + at least 1 byte of ciphertext + auth tag (16).
  const MIN_LENGTH = GCM_IV_BYTES + 1 + GCM_TAG_BITS / 8;
  if (combined.length < MIN_LENGTH) {
    throw new Error('Ciphertext is too short to be valid');
  }

  let key: CryptoKey;
  try {
    key = await deriveKey(masterKey, orgId);
  } catch {
    throw new Error('Failed to derive decryption key');
  }

  const iv = combined.slice(0, GCM_IV_BYTES);
  const encryptedData = combined.slice(GCM_IV_BYTES);

  let plaintextBuffer: ArrayBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: GCM_TAG_BITS },
      key,
      encryptedData,
    );
  } catch {
    // DOMException from auth tag mismatch, wrong key, or corrupted data.
    // Do NOT include the ciphertext or key in the error message.
    throw new Error('Decryption failed: invalid ciphertext or key mismatch');
  }

  return new TextDecoder().decode(plaintextBuffer);
}
