import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, SKIP_RATE_LIMIT_KEY } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

function makeContext(overrides: {
  organizationId?: string;
  userId?: string;
  skipRateLimit?: boolean;
}): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: overrides.organizationId
          ? { organizationId: overrides.organizationId, id: overrides.userId }
          : null,
        headers: {},
        route: { path: '/api/v1/test' },
        method: 'GET',
        url: '/api/v1/test',
        ip: '127.0.0.1',
      }),
      getResponse: () => ({
        setHeader: jest.fn(),
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  const makeReflector = (skip: boolean) =>
    ({ getAllAndOverride: jest.fn().mockReturnValue(skip ? true : undefined) } as unknown as Reflector);

  const makeService = (allowed: boolean) =>
    ({
      checkRateLimit: jest.fn().mockResolvedValue({
        allowed,
        limit: 100,
        remaining: allowed ? 99 : 0,
        reset: new Date(),
        tierName: 'Free',
      }),
    } as unknown as RateLimitService);

  it('passes through when @SkipRateLimit() is set', async () => {
    const guard = new RateLimitGuard(makeService(true), makeReflector(true));
    const result = await guard.canActivate(makeContext({ organizationId: 'org-1' }));
    expect(result).toBe(true);
  });

  it('skips limit check when no org context', async () => {
    const svc = makeService(true);
    const guard = new RateLimitGuard(svc, makeReflector(false));
    const result = await guard.canActivate(makeContext({}));
    expect(result).toBe(true);
    expect(svc.checkRateLimit).not.toHaveBeenCalled();
  });

  it('allows request when within limits', async () => {
    const guard = new RateLimitGuard(makeService(true), makeReflector(false));
    const result = await guard.canActivate(makeContext({ organizationId: 'org-1' }));
    expect(result).toBe(true);
  });

  it('throws 429 when limit is exceeded', async () => {
    const guard = new RateLimitGuard(makeService(false), makeReflector(false));
    await expect(
      guard.canActivate(makeContext({ organizationId: 'org-1' })),
    ).rejects.toBeInstanceOf(HttpException);

    try {
      await guard.canActivate(makeContext({ organizationId: 'org-1' }));
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(429);
    }
  });

  it('sets X-RateLimit headers on response', async () => {
    const setHeader = jest.fn();
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { organizationId: 'org-1', id: 'u1' },
          headers: {},
          route: { path: '/test' },
          method: 'GET',
          url: '/test',
          ip: '127.0.0.1',
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    const guard = new RateLimitGuard(makeService(true), makeReflector(false));
    await guard.canActivate(ctx);
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Tier', expect.any(String));
  });
});
