/**
 * Encryption utilities for sensitive database configuration data
 * 
 * Note: This uses SubtleCrypto (Web Crypto API) for encryption.
 * For production with Cloudflare Workers, SubtleCrypto is available as crypto.subtle.
 * 
 * Algorithm: AES-GCM (256-bit)
 * - Authenticated encryption with associated data (AEAD)
 * - Industry standard for secure password storage in cloud environments
 * - Provides both encryption and integrity verification
 */

/**
 * Derive an encryption key from the organization ID.
 * In production, this should use a proper key derivation function (PBKDF2, Argon2, etc.)
 * and a proper master key from secure storage.
 * 
 * For now: Uses a simplified approach with crypto.subtle
 * TODO: Replace with proper key management in production
 */
async function deriveEncryptionKey(organizationId: string): Promise<CryptoKey> {
  // In production, you would:
  // 1. Fetch the organization's master encryption key from secure storage
  // 2. Use PBKDF2 or similar to derive a database-specific key
  // 3. Use that key for all database configs for that org

  // For now, we'll use a simple approach with SubtleCrypto
  const encoder = new TextEncoder();
  const data = encoder.encode(`org:${organizationId}`);

  // Hash the organization ID to get a consistent key material
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Import the hash as a key
  const key = await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false, // Not extractable for security
    ['encrypt', 'decrypt'],
  );

  return key;
}

/**
 * Encrypt a sensitive string (password, API key, etc.)
 * Returns a JSON string with base64-encoded ciphertext, IV, and auth tag
 */
export async function encrypt(plaintext: string, organizationId: string): Promise<string> {
  try {
    const key = await deriveEncryptionKey(organizationId);
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // Generate a random IV (initialization vector) for each encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt using AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      plaintextBytes,
    );

    // Encode IV and ciphertext as base64 for storage
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

    // Return a JSON object with both values
    return JSON.stringify({
      encrypted: true,
      version: 1, // For future key rotation support
      iv: ivBase64,
      ciphertext: ciphertextBase64,
    });
  } catch (error) {
    console.error('Encryption failed:', error);
    // Fallback to BASE64 for backward compatibility during migration
    console.warn('Falling back to BASE64 encoding due to encryption error');
    return btoa(plaintext);
  }
}

/**
 * Decrypt an encrypted string
 * Handles both new JSON format and legacy BASE64 format
 */
export async function decrypt(encrypted: string, organizationId: string): Promise<string> {
  try {
    // Try to parse as JSON (new format)
    let encryptedData;
    try {
      encryptedData = JSON.parse(encrypted);
    } catch {
      // Not JSON, try legacy BASE64 format
      try {
        return atob(encrypted);
      } catch {
        console.error('Could not parse encrypted value');
        return '';
      }
    }

    // Handle JSON format
    if (typeof encryptedData === 'object' && encryptedData.encrypted) {
      const key = await deriveEncryptionKey(organizationId);
      const decoder = new TextDecoder();

      // Decode IV and ciphertext from base64
      const iv = new Uint8Array(
        atob(encryptedData.iv)
          .split('')
          .map((c) => c.charCodeAt(0)),
      );
      const ciphertext = new Uint8Array(
        atob(encryptedData.ciphertext)
          .split('')
          .map((c) => c.charCodeAt(0)),
      );

      // Decrypt using AES-GCM
      const plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
        },
        key,
        ciphertext,
      );

      return decoder.decode(plaintext);
    }

    // Fallback for unknown formats
    return '';
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

/**
 * Check if a value is encrypted (new format)
 */
export function isEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed.encrypted === true;
  } catch {
    // Legacy BASE64 format is considered "not encrypted" (backward compatible)
    return false;
  }
}

/**
 * Migration helper: Re-encrypt a value that might be in BASE64 format
 */
export async function migrateToEncryption(
  value: string,
  organizationId: string,
): Promise<string> {
  // If already encrypted in new format, return as-is
  if (isEncrypted(value)) {
    return value;
  }

  // Otherwise, treat as plaintext/BASE64 and encrypt properly
  try {
    const plaintext = atob(value);
    return await encrypt(plaintext, organizationId);
  } catch {
    // If it fails to decode as BASE64, assume it's already plaintext
    return await encrypt(value, organizationId);
  }
}
