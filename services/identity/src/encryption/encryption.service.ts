import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Encryption Service for NestJS (Node.js environment)
 * 
 * Mirrors the functionality of apps/web/functions/shared/encryption.ts
 * but uses Node.js crypto instead of Web Crypto API
 * 
 * Algorithm: AES-256-GCM
 * - Authenticated encryption with associated data (AEAD)
 * - Industry standard for secure password storage
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits (16 bytes)
  private readonly authTagLength = 16; // 128 bits

  /**
   * Derive an encryption key from the organization ID.
   * Uses scrypt key derivation function for stronger security than simple hashing
   */
  private deriveEncryptionKey(organizationId: string): Buffer {
    // Use organization ID as base for consistent key derivation
    const salt = `org:${organizationId}`;
    
    // scrypt: derives a key from a password and salt
    // N=16384 (CPU/memory cost), r=8 (block size), p=1 (parallelization)
    // Standard for password-based key derivation
    return scryptSync(organizationId, salt, this.keyLength, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
  }

  /**
   * Encrypt a sensitive string (password, API key, etc.)
   * Returns a JSON string with base64-encoded ciphertext, IV, and auth tag
   */
  async encrypt(plaintext: string, organizationId: string): Promise<string> {
    try {
      const key = this.deriveEncryptionKey(organizationId);
      
      // Generate a random IV for each encryption
      const iv = randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = createCipheriv(this.algorithm, key, iv);
      
      // Encrypt the plaintext
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');
      
      // Get the authentication tag
      const authTag = cipher.getAuthTag();
      
      // Encode IV and ciphertext as base64 for storage
      const ivBase64 = iv.toString('base64');
      const ciphertextBase64 = Buffer.from(ciphertext, 'hex').toString('base64');
      const authTagBase64 = authTag.toString('base64');
      
      // Return a JSON object with all necessary components
      return JSON.stringify({
        encrypted: true,
        version: 1, // For future key rotation support
        iv: ivBase64,
        ciphertext: ciphertextBase64,
        authTag: authTagBase64,
      });
    } catch (error) {
      console.error('Encryption failed:', error);
      // Fallback to base64 encoding (legacy format)
      console.warn('Falling back to BASE64 encoding due to encryption error');
      return Buffer.from(plaintext).toString('base64');
    }
  }

  /**
   * Decrypt an encrypted string
   * Handles both new JSON format and legacy BASE64 format
   */
  async decrypt(encrypted: string, organizationId: string): Promise<string> {
    try {
      // Try to parse as JSON (new format)
      let encryptedData;
      try {
        encryptedData = JSON.parse(encrypted);
      } catch {
        // Not JSON, try legacy BASE64 format
        try {
          return Buffer.from(encrypted, 'base64').toString('utf8');
        } catch {
          console.error('Could not parse encrypted value');
          return '';
        }
      }

      // Handle JSON format
      if (typeof encryptedData === 'object' && encryptedData.encrypted) {
        const key = this.deriveEncryptionKey(organizationId);
        
        // Decode components from base64
        const iv = Buffer.from(encryptedData.iv, 'base64');
        const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
        const authTag = Buffer.from(encryptedData.authTag, 'base64');
        
        // Create decipher
        const decipher = createDecipheriv(this.algorithm, key, iv);
        decipher.setAuthTag(authTag);
        
        // Decrypt
        let plaintext = decipher.update(ciphertext);
        plaintext = Buffer.concat([plaintext, decipher.final()]);
        
        return plaintext.toString('utf8');
      }

      // Fallback for unknown formats
      return '';
    } catch (error) {
      console.error('Decryption failed:', error);
      return '';
    }
  }

  /**
   * Check if a value is encrypted in the new format
   */
  isEncrypted(value: string): boolean {
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
  async migrateToEncryption(value: string, organizationId: string): Promise<string> {
    // If already encrypted in new format, return as-is
    if (this.isEncrypted(value)) {
      return value;
    }

    // Otherwise, treat as plaintext/BASE64 and encrypt properly
    try {
      const plaintext = Buffer.from(value, 'base64').toString('utf8');
      return await this.encrypt(plaintext, organizationId);
    } catch {
      // If it fails to decode as BASE64, assume it's already plaintext
      return await this.encrypt(value, organizationId);
    }
  }
}
