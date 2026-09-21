import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const masterKey = 'test-master-key-with-at-least-32-bytes-123456';
  let service: EncryptionService;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue(masterKey) } as unknown as ConfigService;
    service = new EncryptionService(config);
  });

  it('round-trips plaintext with v2 encryption', async () => {
    const plain = 'super-secret-api-key-12345';
    const enc = await service.encrypt(plain, 'org-abc-123');
    expect(JSON.parse(enc).version).toBe(2);
    expect(await service.decrypt(enc, 'org-abc-123')).toBe(plain);
  });

  it('uses a random IV for each encryption', async () => {
    const a = await service.encrypt('same-value', 'org-1');
    const b = await service.encrypt('same-value', 'org-1');
    expect(a).not.toBe(b);
  });

  it('rejects a different organization through authenticated context', async () => {
    const enc = await service.encrypt('secret', 'org-a');
    await expect(service.decrypt(enc, 'org-b')).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const parsed = JSON.parse(await service.encrypt('secret', 'org-a')) as Record<string, unknown>;
    parsed.ciphertext = Buffer.from('tampered').toString('base64');
    await expect(service.decrypt(JSON.stringify(parsed), 'org-a')).rejects.toThrow();
  });

  it('fails closed when the master key is missing', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const noKey = new EncryptionService(config);
    await expect(noKey.encrypt('secret', 'org-a')).rejects.toThrow('EIP_ENCRYPTION_MASTER_KEY');
  });

  it('fails closed for non-envelope values', async () => {
    await expect(service.decrypt(Buffer.from('legacy password').toString('base64'), 'org-a')).rejects.toThrow();
  });

  it('recognizes encrypted envelopes', async () => {
    const enc = await service.encrypt('test', 'org-1');
    expect(service.isEncrypted(enc)).toBe(true);
    expect(service.isEncrypted('not-encrypted')).toBe(false);
  });

  it('migrates historical base64 values to v2', async () => {
    const original = 'old-password';
    const b64 = Buffer.from(original).toString('base64');
    const migrated = await service.migrateToEncryption(b64, 'org-m');
    expect(JSON.parse(migrated).version).toBe(2);
    expect(await service.decrypt(migrated, 'org-m')).toBe(original);
  });

  it('migrates legacy v1 ciphertext to v2', async () => {
    // Reproduce the old v1 envelope only inside the migration test.
    const { createCipheriv, randomBytes, scryptSync } = await import('crypto');
    const key = scryptSync('org-legacy', 'org:org-legacy', 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update('legacy-secret', 'utf8'), cipher.final()]);
    const legacy = JSON.stringify({
      encrypted: true,
      version: 1,
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    });

    const migrated = await service.migrateToEncryption(legacy, 'org-legacy');
    expect(JSON.parse(migrated).version).toBe(2);
    expect(await service.decrypt(migrated, 'org-legacy')).toBe('legacy-secret');
  });
});
