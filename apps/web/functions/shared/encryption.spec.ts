import { decrypt, encrypt, isEncrypted, migrateToEncryption } from './encryption';

const env = {
  EIP_ENCRYPTION_MASTER_KEY: 'test-master-key-with-at-least-32-bytes-123456',
};

describe('Pages encryption', () => {
  it('round-trips v2 values', async () => {
    const value = await encrypt('secret-value', 'org-1', env);
    expect(JSON.parse(value).version).toBe(2);
    expect(await decrypt(value, 'org-1', env)).toBe('secret-value');
  });

  it('uses different ciphertext for the same plaintext', async () => {
    const a = await encrypt('same', 'org-1', env);
    const b = await encrypt('same', 'org-1', env);
    expect(a).not.toBe(b);
  });

  it('rejects wrong organization and tampering', async () => {
    const value = await encrypt('secret', 'org-1', env);
    await expect(decrypt(value, 'org-2', env)).rejects.toThrow();

    const parsed = JSON.parse(value);
    parsed.ciphertext = btoa('tampered');
    await expect(decrypt(JSON.stringify(parsed), 'org-1', env)).rejects.toThrow();
  });

  it('fails closed when the master secret is absent', async () => {
    await expect(encrypt('secret', 'org-1', {})).rejects.toThrow('EIP_ENCRYPTION_MASTER_KEY');
  });

  it('does not accept raw base64 as encrypted data', async () => {
    const legacy = btoa('legacy');
    expect(isEncrypted(legacy)).toBe(false);
    await expect(decrypt(legacy, 'org-1', env)).rejects.toThrow();
  });

  it('migrates base64 values to v2', async () => {
    const migrated = await migrateToEncryption(btoa('legacy-secret'), 'org-1', env);
    expect(JSON.parse(migrated).version).toBe(2);
    expect(await decrypt(migrated, 'org-1', env)).toBe('legacy-secret');
  });

  it('migrates a legacy Pages v1 envelope to v2', async () => {
    const legacyKeyMaterial = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode('org:org-legacy'),
    );
    const legacyKey = await crypto.subtle.importKey(
      'raw',
      legacyKeyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      legacyKey,
      new TextEncoder().encode('legacy-secret'),
    );
    const legacy = JSON.stringify({
      encrypted: true,
      version: 1,
      iv: btoa(String.fromCharCode(...iv)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    });

    const migrated = await migrateToEncryption(legacy, 'org-legacy', env);
    expect(JSON.parse(migrated).version).toBe(2);
    expect(await decrypt(migrated, 'org-legacy', env)).toBe('legacy-secret');
  });
});
