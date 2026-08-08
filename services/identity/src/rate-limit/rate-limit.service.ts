/**
 * Rate Limiting Service (B.3.2)
 * 
 * Implements tiered rate limiting with sliding window algorithm.
 * Tracks API usage per organization and enforces tier-based limits.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RateLimitCheck {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: Date;
  tierName: string;
  violated?: boolean;
}

export interface RateLimitTierDto {
  name: string;
  displayName: string;
  requestsPerDay: number;
  requestsPerHour: number;
  requestsPerMinute: number;
  maxConnectors: number | null;
  maxUsers: number | null;
  enableWebhooks: boolean;
  enableSso: boolean;
  enableCustomRoles: boolean;
  enableAgents: boolean;
  enableAdvancedBI: boolean;
  monthlyPrice: number;
}

@Injectable()
export class RateLimitService {
  constructor(private prisma: PrismaService) {}

  /**
   * Check if request is allowed under current tier limits
   */
  async checkRateLimit(
    organizationId: string,
    userId: string | null,
    endpoint: string,
    method: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RateLimitCheck> {
    // Get organization tier
    const orgTier = await this.prisma.organizationTier.findUnique({
      where: { organizationId },
      include: { tier: true },
    });

    // Default to free tier if no tier assigned
    const tier = orgTier?.tier ?? (await this.getFreeTier());

    // Hard fallback if DB has no tiers seeded yet
    if (!tier) {
      return { allowed: true, limit: 100, remaining: 99, reset: new Date(), tierName: 'free' };
    }

    // Check minute limit (most restrictive)
    const minuteCheck = await this.checkWindow(
      organizationId,
      userId,
      endpoint,
      method,
      'minute',
      tier.requestsPerMinute,
    );

    if (!minuteCheck.allowed) {
      await this.logViolation(
        organizationId,
        userId,
        endpoint,
        method,
        tier.name,
        tier.requestsPerMinute,
        minuteCheck.remaining + 1,
        'minute',
        ipAddress,
        userAgent,
      );
      return minuteCheck;
    }

    // Check hour limit
    const hourCheck = await this.checkWindow(
      organizationId,
      userId,
      endpoint,
      method,
      'hour',
      tier.requestsPerHour,
    );

    if (!hourCheck.allowed) {
      await this.logViolation(
        organizationId,
        userId,
        endpoint,
        method,
        tier.name,
        tier.requestsPerHour,
        hourCheck.remaining + 1,
        'hour',
        ipAddress,
        userAgent,
      );
      return hourCheck;
    }

    // Check day limit
    const dayCheck = await this.checkWindow(
      organizationId,
      userId,
      endpoint,
      method,
      'day',
      tier.requestsPerDay,
    );

    if (!dayCheck.allowed) {
      await this.logViolation(
        organizationId,
        userId,
        endpoint,
        method,
        tier.name,
        tier.requestsPerDay,
        dayCheck.remaining + 1,
        'day',
        ipAddress,
        userAgent,
      );
      return dayCheck;
    }

    // All checks passed - record usage
    await this.recordUsage(organizationId, userId, endpoint, method);

    return {
      allowed: true,
      limit: tier.requestsPerDay,
      remaining: dayCheck.remaining - 1,
      reset: dayCheck.reset,
      tierName: tier.displayName,
    };
  }

  /**
   * Check usage within a time window
   */
  private async checkWindow(
    organizationId: string,
    userId: string | null,
    endpoint: string,
    method: string,
    window: 'minute' | 'hour' | 'day',
    limit: number,
  ): Promise<RateLimitCheck> {
    const now = new Date();
    const windowStart = this.getWindowStart(now, window);
    const windowEnd = this.getWindowEnd(now, window);

    // Count requests in current window
    const usage = await this.prisma.apiUsage.aggregate({
      where: {
        organizationId,
        endpoint,
        method,
        windowStart: { gte: windowStart },
      },
      _sum: { requestCount: true },
    });

    const currentCount = usage._sum.requestCount || 0;
    const remaining = Math.max(0, limit - currentCount);
    const allowed = currentCount < limit;

    return {
      allowed,
      limit,
      remaining,
      reset: windowEnd,
      tierName: '',
    };
  }

  /**
   * Record API usage
   */
  private async recordUsage(
    organizationId: string,
    userId: string | null,
    endpoint: string,
    method: string,
  ): Promise<void> {
    const now = new Date();
    const windowStart = this.getWindowStart(now, 'day');
    const windowEnd = this.getWindowEnd(now, 'day');

    // Upsert usage record
    const existing = await this.prisma.apiUsage.findFirst({
      where: {
        organizationId,
        userId,
        endpoint,
        method,
        windowStart,
      },
    });

    if (existing) {
      await this.prisma.apiUsage.update({
        where: { id: existing.id },
        data: { requestCount: { increment: 1 } },
      });
    } else {
      await this.prisma.apiUsage.create({
        data: {
          organizationId,
          userId,
          endpoint,
          method,
          requestCount: 1,
          windowStart,
          windowEnd,
        },
      });
    }
  }

  /**
   * Log rate limit violation
   */
  private async logViolation(
    organizationId: string,
    userId: string | null,
    endpoint: string,
    method: string,
    tierName: string,
    limit: number,
    actualCount: number,
    windowType: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.prisma.rateLimitViolation.create({
      data: {
        organizationId,
        userId,
        endpoint,
        method,
        tierName,
        limit,
        actualCount,
        windowType,
        ipAddress,
        userAgent,
      },
    });
  }

  /**
   * Get window start time
   */
  private getWindowStart(now: Date, window: 'minute' | 'hour' | 'day'): Date {
    const date = new Date(now);
    switch (window) {
      case 'minute':
        date.setSeconds(0, 0);
        break;
      case 'hour':
        date.setMinutes(0, 0, 0);
        break;
      case 'day':
        date.setHours(0, 0, 0, 0);
        break;
    }
    return date;
  }

  /**
   * Get window end time
   */
  private getWindowEnd(now: Date, window: 'minute' | 'hour' | 'day'): Date {
    const date = this.getWindowStart(now, window);
    switch (window) {
      case 'minute':
        date.setMinutes(date.getMinutes() + 1);
        break;
      case 'hour':
        date.setHours(date.getHours() + 1);
        break;
      case 'day':
        date.setDate(date.getDate() + 1);
        break;
    }
    return date;
  }

  /**
   * Get free tier
   */
  private async getFreeTier() {
    return this.prisma.rateLimitTier.findUnique({
      where: { name: 'free' },
    });
  }

  /**
   * Get organization's current tier
   */
  async getOrganizationTier(organizationId: string): Promise<RateLimitTierDto | null> {
    const orgTier = await this.prisma.organizationTier.findUnique({
      where: { organizationId },
      include: { tier: true },
    });

    const freeTier = await this.getFreeTier();
    const resolved = orgTier?.tier ?? freeTier;
    if (!resolved) return null;
    return this.mapTierToDto(resolved);
  }

  /**
   * List all available tiers
   */
  async listTiers(): Promise<RateLimitTierDto[]> {
    const tiers = await this.prisma.rateLimitTier.findMany({
      orderBy: { requestsPerDay: 'asc' },
    });
    return tiers.map(this.mapTierToDto);
  }

  /**
   * Assign tier to organization
   */
  async assignTier(organizationId: string, tierName: string): Promise<void> {
    const tier = await this.prisma.rateLimitTier.findUnique({
      where: { name: tierName },
    });

    if (!tier) {
      throw new Error(`Tier "${tierName}" not found`);
    }

    await this.prisma.organizationTier.upsert({
      where: { organizationId },
      update: { tierId: tier.id },
      create: { organizationId, tierId: tier.id },
    });
  }

  /**
   * Get usage stats for organization
   */
  async getUsageStats(organizationId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const usage = await this.prisma.apiUsage.findMany({
      where: {
        organizationId,
        windowStart: { gte: since },
      },
      orderBy: { windowStart: 'desc' },
      take: 100,
    });

    const violations = await this.prisma.rateLimitViolation.findMany({
      where: {
        organizationId,
        blockedAt: { gte: since },
      },
      orderBy: { blockedAt: 'desc' },
      take: 50,
    });

    return { usage, violations };
  }

  /**
   * Map tier entity to DTO
   */
  private mapTierToDto(tier: any): RateLimitTierDto {
    return {
      name: tier.name,
      displayName: tier.displayName,
      requestsPerDay: tier.requestsPerDay,
      requestsPerHour: tier.requestsPerHour,
      requestsPerMinute: tier.requestsPerMinute,
      maxConnectors: tier.maxConnectors,
      maxUsers: tier.maxUsers,
      enableWebhooks: tier.enableWebhooks,
      enableSso: tier.enableSso,
      enableCustomRoles: tier.enableCustomRoles,
      enableAgents: tier.enableAgents,
      enableAdvancedBI: tier.enableAdvancedBI,
      monthlyPrice: tier.monthlyPrice,
    };
  }
}
