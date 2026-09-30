/**
 * EnterpriseService tests
 *
 * Tests pure helper functions (redactConfig, mergeConfig) and
 * DB-backed methods (listConnectors, createInstallation, etc.) with mocks.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EnterpriseService } from './enterprise.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ConfigService } from '@nestjs/config';

// ─── Pure helper: redactConfig ───────────────────────────────────────────────
// Accessed indirectly via toInstallationDto — but we can exercise the
// behaviour through createInstallation / listInstallations responses.

// ─── Mock factory ────────────────────────────────────────────────────────────
const mockOrg = { id: 'org-1', name: 'Test Org', slug: 'test-org', isActive: true, isSuspended: false, settings: null };

function makeInstallation(overrides: Record<string, any> = {}) {
  return {
    id: 'inst-1', organizationId: 'org-1', catalogId: 'rest-api', name: 'REST API',
    config: { baseUrl: 'https://api.example.com', apiKey: 'secret-key-123' },
    isActive: true, lastSyncedAt: null, syncIntervalMinutes: 60,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue(mockOrg),
    },
    connectorInstallation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeInstallation()),
      update: jest.fn().mockResolvedValue(makeInstallation()),
      delete: jest.fn().mockResolvedValue({}),
    },
    enterpriseSnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    connectorPack: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'pack-1' }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaService;
}

// ─── Encryption helper ───────────────────────────────────────────────────────
// A real EncryptionService (not a stub) so the tests prove secrets are actually
// encrypted at rest rather than merely asserting a mock was called.
const TEST_MASTER_KEY = 'test-master-key-that-is-definitely-long-enough-32b';

function makeEncryption(): EncryptionService {
  const config = { get: (key: string) => (key === 'EIP_ENCRYPTION_MASTER_KEY' ? TEST_MASTER_KEY : undefined) };
  return new EncryptionService(config as unknown as ConfigService);
}

// ─── listInstallations ───────────────────────────────────────────────────────
describe('EnterpriseService.listInstallations', () => {
  it('returns empty array when no installations', async () => {
    const svc = new EnterpriseService(makePrisma(), makeEncryption());
    const result = await svc.listInstallations('org-1');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns mapped installation DTOs', async () => {
    const prisma = makePrisma({
      connectorInstallation: {
        ...makePrisma().connectorInstallation,
        findMany: jest.fn().mockResolvedValue([makeInstallation()]),
      },
    });
    const svc = new EnterpriseService(prisma, makeEncryption());
    const result = await svc.listInstallations('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('inst-1');
    // Secrets must be redacted
    expect((result[0].config as any).apiKey).toBe('***');
  });
});

// ─── createInstallation ──────────────────────────────────────────────────────
describe('EnterpriseService.createInstallation', () => {
  it('creates a rest-api installation', async () => {
    const prisma = makePrisma();
    const svc = new EnterpriseService(prisma, makeEncryption());
    await svc.createInstallation('org-1', 'user-1', {
      catalogId: 'rest-api',
      displayName: 'My API',
      config: { endpoint: 'https://api.example.com' },
    });
    expect(prisma.connectorInstallation.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('encrypts credential fields at rest (never stores plaintext)', async () => {
    const prisma = makePrisma();
    const svc = new EnterpriseService(prisma, makeEncryption());

    await svc.createInstallation('org-1', 'user-1', {
      catalogId: 'rest-api',
      displayName: 'My API',
      config: {
        endpoint: 'https://api.example.com',
        apiKey: 'super-secret-key',
        bearerToken: 'super-secret-bearer',
        basicPass: 'super-secret-pass',
        connectionString: 'postgres://u:secretpass@h/db',
        imapPassword: 'imap-secret',
        sftpPassword: 'sftp-secret',
        sftpPrivateKey: 'PRIVATE-KEY-BLOB',
      },
    });

    const { data } = (prisma.connectorInstallation.create as jest.Mock).mock.calls[0][0];
    const stored = data.config as Record<string, unknown>;

    for (const key of [
      'apiKey', 'bearerToken', 'basicPass', 'connectionString',
      'imapPassword', 'sftpPassword', 'sftpPrivateKey',
    ]) {
      expect(typeof stored[key]).toBe('string');
      // Must be an EIP encryption envelope, not the submitted secret.
      expect(stored[key]).not.toContain('super-secret');
      expect(stored[key]).not.toContain('PRIVATE-KEY-BLOB');
      expect(JSON.parse(stored[key] as string)).toMatchObject({ encrypted: true, version: 2 });
    }

    // Non-secret configuration must survive untouched.
    expect(stored.endpoint).toBe('https://api.example.com');
  });

  it('never returns the secret in the installation DTO', async () => {
    const encryption = makeEncryption();
    const encryptedApiKey = await encryption.encrypt('super-secret-key', 'org-1');
    const prisma = makePrisma({
      connectorInstallation: {
        findMany: jest.fn().mockResolvedValue([
          makeInstallation({ config: { baseUrl: 'https://api.example.com', apiKey: encryptedApiKey } }),
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    });
    const svc = new EnterpriseService(prisma, encryption);

    const [dto] = await svc.listInstallations('org-1');
    expect(dto.config.apiKey).toBe('***');
    expect(JSON.stringify(dto)).not.toContain('super-secret-key');
  });

  it('throws BadRequestException for unknown catalogId', async () => {
    const svc = new EnterpriseService(makePrisma(), makeEncryption());
    await expect(
      svc.createInstallation('org-1', 'user-1', {
        catalogId: 'unknown-connector-type',
        displayName: 'Bad',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── deleteInstallation ──────────────────────────────────────────────────────
describe('EnterpriseService.deleteInstallation', () => {
  it('throws NotFoundException when installation missing', async () => {
    const svc = new EnterpriseService(makePrisma(), makeEncryption());
    await expect(svc.deleteInstallation('org-1', 'inst-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an existing installation', async () => {
    const prisma = makePrisma({
      connectorInstallation: {
        ...makePrisma().connectorInstallation,
        findFirst: jest.fn().mockResolvedValue(makeInstallation()),
      },
    });
    const svc = new EnterpriseService(prisma, makeEncryption());
    await svc.deleteInstallation('org-1', 'inst-1');
    expect(prisma.connectorInstallation.delete).toHaveBeenCalledWith({ where: { id: 'inst-1' } });
  });
});

// ─── updateInstallation ──────────────────────────────────────────────────────
describe('EnterpriseService.updateInstallation', () => {
  it('throws NotFoundException for missing installation', async () => {
    const svc = new EnterpriseService(makePrisma(), makeEncryption());
    await expect(
      svc.updateInstallation('org-1', 'inst-missing', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('merges config preserving redacted secret fields, and encrypts at rest', async () => {
    const inst = makeInstallation({ config: { endpoint: 'https://api.example.com', apiKey: 'real-secret' } });
    const prisma = makePrisma({
      connectorInstallation: {
        ...makePrisma().connectorInstallation,
        findFirst: jest.fn().mockResolvedValue(inst),
      },
    });
    const encryption = makeEncryption();
    const svc = new EnterpriseService(prisma, encryption);
    await svc.updateInstallation('org-1', 'inst-1', {
      config: { endpoint: 'https://newapi.example.com', apiKey: '***' },
    });
    const updateCall = (prisma.connectorInstallation.update as jest.Mock).mock.calls[0][0];
    const stored = updateCall.data.config as Record<string, any>;

    // The '***' sentinel must preserve the existing secret rather than overwrite it...
    expect(stored.endpoint).toBe('https://newapi.example.com');
    // ...but what is persisted is ciphertext, not the plaintext secret.
    expect(stored.apiKey).not.toBe('real-secret');
    expect(stored.apiKey).not.toBe('***');
    expect(JSON.parse(stored.apiKey)).toMatchObject({ encrypted: true, version: 2 });

    // The preserved secret must still round-trip back to its original value.
    const decrypted = await encryption.decrypt(stored.apiKey, 'org-1');
    expect(decrypted).toBe('real-secret');
  });
});

// ─── parseOpenApi ─────────────────────────────────────────────────────────────
describe('EnterpriseService.parseOpenApi', () => {
  it('returns structured data for valid minimal OpenAPI doc', () => {
    const svc = new EnterpriseService(makePrisma(), makeEncryption());
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': { get: { operationId: 'listUsers', summary: 'List users', responses: {} } },
        '/users/{id}': { get: { operationId: 'getUser', responses: {} } },
      },
    };
    const result = svc.parseOpenApi(doc);
    expect(result).toBeDefined();
  });

  it('does not throw for empty doc', () => {
    const svc = new EnterpriseService(makePrisma(), makeEncryption());
    expect(() => svc.parseOpenApi({})).not.toThrow();
  });
});

// ─── listPacks ────────────────────────────────────────────────────────────────
describe('EnterpriseService.listPacks', () => {
  it('returns empty array when no packs', async () => {
    const svc = new EnterpriseService(makePrisma(), makeEncryption());
    const result = await svc.listPacks();
    expect(Array.isArray(result)).toBe(true);
  });
});
