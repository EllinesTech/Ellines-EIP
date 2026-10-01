/**
 * Ellines EIP — Credential Encryption (AES-256-GCM, Node.js crypto)
 *
 * Used by the shared package and any Node.js service that needs to encrypt
 * connector credentials or other sensitive fields.
 *
 * Key: ENCRYPTION_KEY env var — exactly 64 hex characters (32 bytes).
 * Wire format: `<iv_base64>:<authTag_base64>:<ciphertext_base64>`
 *
 * Cloudflare Pages Functions use `apps/web/functions/shared/encryption.ts`
 * (Web Crypto + HKDF) — that path is the authoritative runtime for the edge.
 * This module is the shared-package equivalent for Node.js contexts (tests,
 * NestJS identity service, tooling).
 *
 * Requirements: 12.7, 13.1, 13.4
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;        // 96-bit IV — recommended for AES-GCM
const TAG_BYTES = 16;       // 128-bit GCM authentication tag
const KEY_HEX_LENGTH = 64;  // 64 hex chars = 32 bytes = 256-bit key
const SEPARATOR = ':';
const ENVELOPE_PARTS = 3;

// ── Key loading ───────────────────────────────────────────────────────────────

function requireEncryptionKey(): Buffer {
  const raw = process.env['ENCRYPTION_KEY'];
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Set it to exactly 64 hex characters (32 bytes).',
    );
  }
  const hex = raw.trim();
  if (hex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly ${KEY_HEX_LENGTH} hex characters (32 bytes). ` +
      `Got ${hex.length} characters.`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must contain only hex characters (0-9, a-f, A-F).');
  }
  return Buffer.from(hex, 'hex');
}

// ── Public: encrypt / decrypt ─────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - Non-empty string to encrypt.
 * @returns         `<iv_base64>:<authTag_base64>:<ciphertext_base64>`
 * @throws          If ENCRYPTION_KEY is missing/invalid, or plaintext is empty.
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encrypt: plaintext must be a non-empty string');
  }

  const key = requireEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(SEPARATOR);
}

/**
 * Decrypt an envelope produced by `encrypt()`.
 *
 * @param ciphertext - `<iv_base64>:<authTag_base64>:<ciphertext_base64>`
 * @returns          The original plaintext string.
 * @throws           If ENCRYPTION_KEY is missing/invalid, the envelope is
 *                   malformed, or GCM authentication fails.
 */
export function decrypt(ciphertext: string): string {
  if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
    throw new Error('decrypt: ciphertext must be a non-empty string');
  }

  const parts = ciphertext.split(SEPARATOR);
  if (parts.length !== ENVELOPE_PARTS) {
    throw new Error(
      `decrypt: invalid envelope — expected ${ENVELOPE_PARTS} colon-separated parts, ` +
      `got ${parts.length}`,
    );
  }

  const [ivB64, tagB64, dataB64] = parts;
  let iv: Buffer;
  let authTag: Buffer;
  let data: Buffer;

  try {
    iv = Buffer.from(ivB64 as string, 'base64');
    authTag = Buffer.from(tagB64 as string, 'base64');
    data = Buffer.from(dataB64 as string, 'base64');
  } catch {
    throw new Error('decrypt: envelope contains invalid base64');
  }

  if (iv.length !== IV_BYTES) {
    throw new Error(`decrypt: IV must be ${IV_BYTES} bytes, got ${iv.length}`);
  }
  if (authTag.length !== TAG_BYTES) {
    throw new Error(`decrypt: auth tag must be ${TAG_BYTES} bytes, got ${authTag.length}`);
  }

  const key = requireEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    // Never surface the ciphertext or key in the error message.
    throw new Error('decrypt: authentication failed — ciphertext is invalid or key mismatch');
  }
}

// ── Public: isEncrypted ───────────────────────────────────────────────────────

/** Base64 character class (URL-safe and standard, no padding issues). */
const B64_PATTERN = /^[A-Za-z0-9+/=]+$/;

/**
 * Returns true when `value` matches the `base64:base64:base64` envelope format
 * produced by `encrypt()`. Does NOT verify the ENCRYPTION_KEY or authenticate.
 */
export function isEncrypted(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parts = value.split(SEPARATOR);
  if (parts.length !== ENVELOPE_PARTS) return false;
  return parts.every((p) => p.length > 0 && B64_PATTERN.test(p));
}

// ── Public: encryptCredentials / decryptCredentials ───────────────────────────

/**
 * Encrypt named credential fields in an object, returning a new object.
 * Fields with `null` or `undefined` values are left untouched.
 * Fields that are already encrypted (as detected by `isEncrypted`) are skipped.
 *
 * @param obj    Source object containing credential fields.
 * @param fields Field names to encrypt.
 * @returns      New object with the named fields encrypted.
 */
export function encryptCredentials<T extends Record<string, unknown>>(
  obj: T,
  fields: ReadonlyArray<keyof T>,
): T {
  const result = { ...obj };
  for (const field of fields) {
    const value = result[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string') continue;
    if (isEncrypted(value)) continue; // already encrypted — skip
    (result as Record<string, unknown>)[field as string] = encrypt(value);
  }
  return result;
}

/**
 * Decrypt named credential fields in an object, returning a new object.
 * Fields with `null` or `undefined` values, non-strings, or unrecognised
 * envelopes are left untouched (logged at warn level, not thrown).
 *
 * @param obj    Source object containing encrypted fields.
 * @param fields Field names to decrypt.
 * @returns      New object with the named fields decrypted.
 */
export function decryptCredentials<T extends Record<string, unknown>>(
  obj: T,
  fields: ReadonlyArray<keyof T>,
): T {
  const result = { ...obj };
  for (const field of fields) {
    const value = result[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string') continue;
    if (!isEncrypted(value)) continue; // not an encrypted envelope — skip
    try {
      (result as Record<string, unknown>)[field as string] = decrypt(value);
    } catch (err) {
      // Log but do not throw — caller decides whether to surface the failure
      console.warn(
        `[encryption] decryptCredentials: failed to decrypt field "${String(field)}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return result;
}
