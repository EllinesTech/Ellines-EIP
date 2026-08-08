/**
 * Rate Limit Guard (B.3.2)
 * 
 * NestJS guard that enforces rate limits on API endpoints.
 * Returns 429 Too Many Requests when limits are exceeded.
 */

import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from './rate-limit.service';

export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private rateLimitService: RateLimitService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if rate limiting is disabled for this endpoint
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipRateLimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Extract auth info from request
    const organizationId = request.user?.organizationId || request.headers['x-organization-id'];
    const userId = request.user?.id || null;
    const endpoint = request.route?.path || request.url;
    const method = request.method;
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    if (!organizationId) {
      // No organization context - skip rate limiting (or apply global limit)
      return true;
    }

    // Check rate limit
    const result = await this.rateLimitService.checkRateLimit(
      organizationId,
      userId,
      endpoint,
      method,
      ipAddress,
      userAgent,
    );

    // Set rate limit headers
    response.setHeader('X-RateLimit-Limit', result.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', result.reset.toISOString());
    response.setHeader('X-RateLimit-Tier', result.tierName);

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.reset.getTime() - Date.now()) / 1000);
      response.setHeader('Retry-After', retryAfter);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Tier: ${result.tierName}. Limit: ${result.limit} requests. Try again in ${retryAfter} seconds.`,
          limit: result.limit,
          remaining: 0,
          reset: result.reset.toISOString(),
          tier: result.tierName,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

/**
 * Decorator to skip rate limiting for specific endpoints
 * Usage: @SkipRateLimit()
 */
export const SkipRateLimit = () => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (propertyKey && descriptor) {
      Reflect.defineMetadata(SKIP_RATE_LIMIT_KEY, true, descriptor.value);
    } else {
      Reflect.defineMetadata(SKIP_RATE_LIMIT_KEY, true, target);
    }
  };
};
