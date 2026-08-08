import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TemplateService } from './template.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTemplate = {
  id: 't1', name: 'REST API', slug: 'rest-api', category: 'api',
  description: 'Generic REST connector', configSchema: { required: ['endpoint'] },
  published: true, createdAt: new Date(), updatedAt: new Date(),
};

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    connectorTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockTemplate),
      update: jest.fn().mockResolvedValue(mockTemplate),
      delete: jest.fn().mockResolvedValue({}),
    },
    connectorInstallation: {
      create: jest.fn().mockResolvedValue({ id: 'inst-1', organizationId: 'org-1' }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

// ─── listTemplates ────────────────────────────────────────────────────────────
describe('TemplateService.listTemplates', () => {
  it('returns empty array when no templates', async () => {
    const svc = new TemplateService(makePrisma());
    expect(await svc.listTemplates()).toEqual([]);
  });

  it('filters by category when provided', async () => {
    const prisma = makePrisma();
    const svc = new TemplateService(prisma);
    await svc.listTemplates('api');
    expect(prisma.connectorTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: 'api' }) }),
    );
  });

  it('returns only published by default', async () => {
    const prisma = makePrisma();
    const svc = new TemplateService(prisma);
    await svc.listTemplates();
    expect(prisma.connectorTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ published: true }) }),
    );
  });
});

// ─── getById ─────────────────────────────────────────────────────────────────
describe('TemplateService.getById', () => {
  it('throws NotFoundException for missing template', async () => {
    const svc = new TemplateService(makePrisma());
    await expect(svc.getById('t-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns template when found', async () => {
    const prisma = makePrisma({ connectorTemplate: { ...makePrisma().connectorTemplate, findUnique: jest.fn().mockResolvedValue(mockTemplate) } });
    const svc = new TemplateService(prisma);
    const result = await svc.getById('t1');
    expect(result.id).toBe('t1');
  });
});

// ─── getBySlug ────────────────────────────────────────────────────────────────
describe('TemplateService.getBySlug', () => {
  it('throws NotFoundException for unknown slug', async () => {
    const svc = new TemplateService(makePrisma());
    await expect(svc.getBySlug('unknown-slug')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns template by slug', async () => {
    const prisma = makePrisma({ connectorTemplate: { ...makePrisma().connectorTemplate, findUnique: jest.fn().mockResolvedValue(mockTemplate) } });
    const svc = new TemplateService(prisma);
    const result = await svc.getBySlug('rest-api');
    expect(result.slug).toBe('rest-api');
  });
});

// ─── getConfigSchema ─────────────────────────────────────────────────────────
describe('TemplateService.getConfigSchema', () => {
  it('returns configSchema from template', async () => {
    const prisma = makePrisma({ connectorTemplate: { ...makePrisma().connectorTemplate, findUnique: jest.fn().mockResolvedValue(mockTemplate) } });
    const svc = new TemplateService(prisma);
    const schema = await svc.getConfigSchema('t1');
    expect(schema).toEqual({ required: ['endpoint'] });
  });
});

// ─── testTemplate ─────────────────────────────────────────────────────────────
describe('TemplateService.testTemplate', () => {
  it('returns success when config is provided', async () => {
    const prisma = makePrisma({ connectorTemplate: { ...makePrisma().connectorTemplate, findUnique: jest.fn().mockResolvedValue(mockTemplate) } });
    const svc = new TemplateService(prisma);
    const result = await svc.testTemplate('t1', { endpoint: 'https://api.example.com' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('REST API');
  });

  it('returns failure for empty config', async () => {
    const prisma = makePrisma({ connectorTemplate: { ...makePrisma().connectorTemplate, findUnique: jest.fn().mockResolvedValue(mockTemplate) } });
    const svc = new TemplateService(prisma);
    const result = await svc.testTemplate('t1', {});
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/empty/i);
  });

  it('throws NotFoundException when template missing', async () => {
    const svc = new TemplateService(makePrisma());
    await expect(svc.testTemplate('t-missing', { endpoint: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── installFromTemplate ──────────────────────────────────────────────────────
describe('TemplateService.installFromTemplate', () => {
  it('creates installation merging template defaults', async () => {
    const tmplWithDefaults = { ...mockTemplate, configSchema: { default: { authType: 'apiKey' } } };
    const prisma = makePrisma({ connectorTemplate: { ...makePrisma().connectorTemplate, findUnique: jest.fn().mockResolvedValue(tmplWithDefaults) } });
    const svc = new TemplateService(prisma);
    await svc.installFromTemplate('org-1', 't1', { endpoint: 'https://api.example.com' }, 'My REST');
    const createCall = (prisma.connectorInstallation.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.organizationId).toBe('org-1');
    expect(createCall.data.displayName).toBe('My REST');
    expect((createCall.data.config as any).authType).toBe('apiKey'); // merged default
  });

  it('uses template name as displayName when not provided', async () => {
    const prisma = makePrisma({ connectorTemplate: { ...makePrisma().connectorTemplate, findUnique: jest.fn().mockResolvedValue(mockTemplate) } });
    const svc = new TemplateService(prisma);
    await svc.installFromTemplate('org-1', 't1', {}, '');
    const createCall = (prisma.connectorInstallation.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.displayName).toBe('REST API');
  });
});

// ─── CRUD ─────────────────────────────────────────────────────────────────────
describe('TemplateService CRUD', () => {
  it('create calls prisma.connectorTemplate.create', async () => {
    const prisma = makePrisma();
    const svc = new TemplateService(prisma);
    await svc.create({ name: 'New', slug: 'new', category: 'api', description: '', configSchema: {}, published: true } as any);
    expect(prisma.connectorTemplate.create).toHaveBeenCalled();
  });

  it('delete calls prisma.connectorTemplate.delete', async () => {
    const prisma = makePrisma();
    const svc = new TemplateService(prisma);
    await svc.delete('t1');
    expect(prisma.connectorTemplate.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });
});
