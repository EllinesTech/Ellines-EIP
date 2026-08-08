import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = new EncryptionService();
  });

  describe('encrypt / decrypt round-trip', () => {
    it('decrypts back to original plaintext', async () => {
      const plain = 'super-secret-api-key-12345';
      const orgId = 'org-abc-123';
      const enc = await service.encrypt(plain, orgId);
      const dec = await service.decrypt(enc, orgId);
      expect(dec).toBe(plain);
    });

    it('produces different ciphertext each call (random IV)', async () => {
      const enc1 = await service.encrypt('same-value', 'org-1');
      const enc2 = await service.encrypt('same-value', 'org-1');
      expect(enc1).not.toBe(enc2);
    });

    it('cannot decrypt with a different org ID', async () => {
      const enc = await service.encrypt('secret', 'org-a');
      const dec = await service.decrypt(enc, 'org-b');
      // Different key → AES-GCM auth tag fails → fallback returns ''
      expect(dec).toBe('');
    });

    it('handles empty string plaintext', async () => {
      const enc = await service.encrypt('', 'org-x');
      const dec = await service.decrypt(enc, 'org-x');
      expect(dec).toBe('');
    });

    it('handles unicode / special characters', async () => {
      const plain = 'Passwörd!@#$%^&*() 日本語';
      const enc = await service.encrypt(plain, 'org-unicode');
      const dec = await service.decrypt(enc, 'org-unicode');
      expect(dec).toBe(plain);
    });
  });

  describe('isEncrypted', () => {
    it('returns true for new-format JSON ciphertext', async () => {
      const enc = await service.encrypt('test', 'org-1');
      expect(service.isEncrypted(enc)).toBe(true);
    });

    it('returns false for plain strings', () => {
      expect(service.isEncrypted('not-encrypted')).toBe(false);
      expect(service.isEncrypted('hello world')).toBe(false);
    });

    it('returns false for legacy base64 strings', () => {
      const b64 = Buffer.from('legacy password').toString('base64');
      expect(service.isEncrypted(b64)).toBe(false);
    });
  });

  describe('decrypt legacy base64', () => {
    it('decodes legacy base64 values transparently', async () => {
      const b64 = Buffer.from('my-legacy-value').toString('base64');
      const dec = await service.decrypt(b64, 'org-any');
      expect(dec).toBe('my-legacy-value');
    });
  });

  describe('migrateToEncryption', () => {
    it('re-encrypts a base64 legacy value', async () => {
      const original = 'old-password';
      const b64 = Buffer.from(original).toString('base64');
      const migrated = await service.migrateToEncryption(b64, 'org-m');
      expect(service.isEncrypted(migrated)).toBe(true);
      const dec = await service.decrypt(migrated, 'org-m');
      expect(dec).toBe(original);
    });

    it('returns as-is when already encrypted', async () => {
      const enc = await service.encrypt('already', 'org-m');
      const result = await service.migrateToEncryption(enc, 'org-m');
      expect(result).toBe(enc);
    });
  });
});
