/**
 * Rate Limit Controller (B.3.2)
 * 
 * Endpoints for managing rate limit tiers and viewing usage stats.
 */

import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SkipRateLimit } from './rate-limit.guard';

@Controller('api/v1/rate-limits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RateLimitController {
  constructor(private rateLimitService: RateLimitService) {}

  /**
   * Get all available tiers
   * Public endpoint - no auth required
   */
  @Get('tiers')
  @SkipRateLimit()
  async listTiers() {
    const tiers = await this.rateLimitService.listTiers();
    return { tiers };
  }

  /**
   * Get organization's current tier
   * Requires authentication
   */
  @Get('orgs/:orgId/tier')
  async getOrganizationTier(@Param('orgId') orgId: string) {
    const tier = await this.rateLimitService.getOrganizationTier(orgId);
    return { tier };
  }

  /**
   * Assign tier to organization
   * Platform admin only
   */
  @Post('orgs/:orgId/tier')
  @Roles('platform_admin')
  @SkipRateLimit()
  async assignTier(
    @Param('orgId') orgId: string,
    @Body() body: { tierName: string },
  ) {
    await this.rateLimitService.assignTier(orgId, body.tierName);
    const tier = await this.rateLimitService.getOrganizationTier(orgId);
    return { tier, message: 'Tier assigned successfully' };
  }

  /**
   * Get usage stats for organization
   * Owner/Admin only
   */
  @Get('orgs/:orgId/usage')
  @Roles('owner', 'admin')
  async getUsageStats(
    @Param('orgId') orgId: string,
    @Body() body?: { days?: number },
  ) {
    const days = body?.days || 30;
    const stats = await this.rateLimitService.getUsageStats(orgId, days);
    return stats;
  }
}
