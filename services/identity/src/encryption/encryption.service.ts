import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Tenant secret encryption.
 *
 * v2:
 * - AES-256-GCM
 * - master secret from EIP_ENCRYPTION_MASTER_KEY
 * - per-organization key derivation from the master secret
 * - organization ID bound as additional authenticated data
 * - random IV for every encryption
 * - fail-closed: encryption/decryption errors are thrown
 *
 * v1 remains readable only so existing credentials can be migrated explicitly.
 * It must never be generated again.
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 12;
  private readonly authTagLength = 16;
  private readonly currentVersion = 2;

  constructor(private readonly config: ConfigService) {}

  private masterSecret(): string {
    const secret = this.config.get<string>('EIP_ENCRYPTION_MASTER_KEY')?.trim();
    if (!secret) throw new Error('EIP_ENCRYPTION_MASTER_KEY is required');
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('EIP_ENCRYPTION_MASTER_KEY must contain at least 32 UTF-8 bytes');
    }
    return secret;
  }

  private deriveV2Key(organizationId: string): Buffer {
    if (!organizationId) throw new Error('organizationId is required');
    return scryptSync(
      this.masterSecret(),
      'ellines-eip:encryption:v2:organization:' + organizationId,
      this.keyLength,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    );
  }

  /** Legacy v1 derivation. Use only while migrating existing ciphertext. */
  private deriveLegacyV1Key(organizationId: string): Buffer {
    if (!organizationId) throw new Error('organizationId is required');
    return scryptSync(
      organizationId,
      'org:' + organizationId,
      this.keyLength,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    );
  }

  async encrypt(plaintext: string, organizationId: string): Promise<string> {
    const key = this.deriveV2Key(organizationId);
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, key, iv);
    cipher.setAAD(Buffer.from(organizationId, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      encrypted: true,
      version: this.currentVersion,
      algorithm: 'AES-256-GCM',
      kdf: 'scrypt(master, organization-context)',
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: authTag.toString('base64'),
    });
  }

  private decryptV1(encryptedData: Record<string, unknown>, organizationId: string): string {
    const key = this.deriveLegacyV1Key(organizationId);
    const iv = Buffer.from(String(encryptedData.iv || ''), 'base64');
    const ciphertext = Buffer.from(String(encryptedData.ciphertext || ''), 'base64');
    const authTag = Buffer.from(String(encryptedData.authTag || ''), 'base64');
    if (iv.length !== 16 || authTag.length !== this.authTagLength || ciphertext.length === 0) {
      throw new Error('Invalid v1 encryption envelope');
    }
    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  async decrypt(encrypted: string, organizationId: string): Promise<string> {
    if (!encrypted || !organizationId) throw new Error('Encrypted value and organizationId are required');

    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(encrypted);
      if (!parsed || typeof parsed !== 'object' || parsed.encrypted !== true) {
        throw new Error('Unsupported encryption envelope');
      }
      data = parsed as Record<string, unknown>;
    } catch {
      throw new Error('Encrypted value is not a supported EIP encryption envelope');
    }

    const version = Number(data.version);
    if (version === 1) return this.decryptV1(data, organizationId);
    if (version !== this.currentVersion) throw new Error('Unsupported encryption version: ' + String(data.version));

    const key = this.deriveV2Key(organizationId);
    const iv = Buffer.from(String(data.iv || ''), 'base64');
    const ciphertext = Buffer.from(String(data.ciphertext || ''), 'base64');
    const authTag = Buffer.from(String(data.authTag || ''), 'base64');
    if (iv.length !== this.ivLength || authTag.length !== this.authTagLength || ciphertext.length === 0) {
      throw new Error('Invalid v2 encryption envelope');
    }

    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAAD(Buffer.from(organizationId, 'utf8'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  isEncrypted(value: string): boolean {
    try {
      const parsed = JSON.parse(value);
      return Boolean(parsed && typeof parsed === 'object' && parsed.encrypted === true && Number(parsed.version) >= 1);
    } catch {
      return false;
    }
  }

  /**
   * Explicit migration only. Supports old v1 ciphertext and historical Base64
   * storage. The output is always v2 encrypted data.
   */
  async migrateToEncryption(value: string, organizationId: string): Promise<string> {
    if (!value || !organizationId) throw new Error('value and organizationId are required');

    if (this.isEncrypted(value)) {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (Number(parsed.version) === this.currentVersion) {
        await this.decrypt(value, organizationId);
        return value;
      }
      if (Number(parsed.version) === 1) {
        return this.encrypt(this.decryptV1(parsed, organizationId), organizationId);
      }
      throw new Error('Unsupported encryption version: ' + String(parsed.version));
    }

    let plaintext: string;
    try {
      plaintext = Buffer.from(value, 'base64').toString('utf8');
      if (!plaintext) throw new Error('empty');
    } catch {
      plaintext = value;
    }
    return this.encrypt(plaintext, organizationId);
  }
}
