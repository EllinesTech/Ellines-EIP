import { RateLimitService } from './rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';

const freeTier = {
  id: 't-free',
  name: 'free',
  displayName: 'Free',
  requestsPerDay: 100,
  requestsPerHour: 20,
  requestsPerMinute: 5,
  maxConnectors: 3,
  maxUsers: 5,
  enableWebhooks: false,
  enableSso: false,
  enableCustomRoles: false,
  enableAgents: false,
  enableAdvancedBI: false,
  monthlyPrice: 0,
};

function makePrisma(overrides: Partial<{
  orgTier: unknown;
  freeTier: unknown;
  usageSum: number;
}> = {}) {
  return {
    organizationTier: {
      findUnique: jest.fn().mockResolvedValue(overrides.orgTier ?? null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    rateLimitTier: {
      findUnique: jest.fn().mockResolvedValue(overrides.freeTier ?? freeTier),
      findMany: jest.fn().mockResolvedValue([freeTier]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    apiUsage: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { requestCount: overrides.usageSum ?? 0 } }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    rateLimitViolation: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    organizationMembership: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;
}

describe('RateLimitService', () => {
  describe('checkRateLimit — below limits', () => {
    it('allows request when no usage recorded (free tier via DB)', async () => {
      const prisma = makePrisma({ usageSum: 0 });
      const svc = new RateLimitService(prisma);
      const result = await svc.checkRateLimit('org-1', 'user-1', '/api/test', 'GET');
      expect(result.allowed).toBe(true);
      expect(result.tierName).toBe('Free');
    });

    it('allows request when just under minute limit', async () => {
      const prisma = makePrisma({ usageSum: 4 }); // limit is 5
      const svc = new RateLimitService(prisma);
      const result = await svc.checkRateLimit('org-1', null, '/api/test', 'GET');
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkRateLimit — at/over limits', () => {
    it('blocks when minute limit is reached', async () => {
      const prisma = makePrisma({ usageSum: 5 }); // limit is 5, so count >= limit
      const svc = new RateLimitService(prisma);
      const result = await svc.checkRateLimit('org-1', null, '/api/test', 'GET');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('logs a violation when rate limit is exceeded', async () => {
      const prisma = makePrisma({ usageSum: 100 });
      const svc = new RateLimitService(prisma);
      await svc.checkRateLimit('org-x', null, '/api/test', 'POST', '1.2.3.4', 'TestAgent/1.0');
      expect(prisma.rateLimitViolation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-x',
            endpoint: '/api/test',
            method: 'POST',
          }),
        }),
      );
    });
  });

  describe('fallback when no tiers seeded', () => {
    it('returns allowed=true with defaults when tier is null', async () => {
      const prisma = makePrisma({ freeTier: null });
      (prisma.rateLimitTier.findUnique as jest.Mock).mockResolvedValue(null);
      const svc = new RateLimitService(prisma);
      const result = await svc.checkRateLimit('org-1', null, '/api/test', 'GET');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
    });
  });

  describe('listTiers', () => {
    it('returns mapped tier DTOs', async () => {
      const prisma = makePrisma();
      const svc = new RateLimitService(prisma);
      const tiers = await svc.listTiers();
      expect(tiers).toHaveLength(1);
      expect(tiers[0].name).toBe('free');
      expect(tiers[0].requestsPerDay).toBe(100);
    });
  });

  describe('assignTier', () => {
    it('upserts organization tier', async () => {
      const prisma = makePrisma();
      const svc = new RateLimitService(prisma);
      await svc.assignTier('org-1', 'free');
      expect(prisma.organizationTier.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('throws when tier name is unknown', async () => {
      const prisma = makePrisma();
      (prisma.rateLimitTier.findUnique as jest.Mock).mockResolvedValue(null);
      const svc = new RateLimitService(prisma);
      await expect(svc.assignTier('org-1', 'nonexistent')).rejects.toThrow(/not found/i);
    });
  });

  describe('getOrganizationTier', () => {
    it('returns free tier when no assignment exists', async () => {
      const prisma = makePrisma();
      const svc = new RateLimitService(prisma);
      const tier = await svc.getOrganizationTier('org-1');
      expect(tier).not.toBeNull();
      expect(tier!.name).toBe('free');
    });

    it('returns null when no tiers seeded at all', async () => {
      const prisma = makePrisma({ freeTier: null });
      (prisma.rateLimitTier.findUnique as jest.Mock).mockResolvedValue(null);
      const svc = new RateLimitService(prisma);
      const tier = await svc.getOrganizationTier('org-1');
      expect(tier).toBeNull();
    });
  });
});
