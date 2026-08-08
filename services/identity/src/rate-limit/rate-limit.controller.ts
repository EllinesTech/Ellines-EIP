/**
 * Rate Limit Controller (B.3.2)
 * 
 * Endpoints for managing rate limit tiers and viewing usage stats.
 */

import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { RateLimitService } from './rate-limit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SkipRateLimit } from './rate-limit.guard';

@ApiTags('Rate Limits')
@Controller('rate-limits')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class RateLimitController {
  constructor(private rateLimitService: RateLimitService) {}

  /**
   * Get all available tiers
   * Public endpoint - no auth required
   */
  @Get('tiers')
  @SkipRateLimit()
  @ApiOperation({
    summary: 'List all rate limit tiers',
    description: 'Get all available rate limit tiers with their features and pricing. Public endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rate limit tiers retrieved successfully',
    schema: {
      example: {
        tiers: [
          {
            name: 'free',
            displayName: 'Free',
            requestsPerDay: 100,
            requestsPerHour: 20,
            requestsPerMinute: 5,
            maxConnectors: 1,
            maxUsers: 3,
            enableWebhooks: false,
            enableSso: false,
            enableCustomRoles: false,
            enableAgents: false,
            enableAdvancedBI: false,
            monthlyPrice: 0,
          },
        ],
      },
    },
  })
  async listTiers() {
    const tiers = await this.rateLimitService.listTiers();
    return { tiers };
  }

  /**
   * Get organization's current tier
   * Requires authentication
   */
  @Get('orgs/:orgId/tier')
  @ApiOperation({
    summary: 'Get organization tier',
    description: 'Get the current rate limit tier for a specific organization.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org_abc123',
  })
  @ApiResponse({
    status: 200,
    description: 'Organization tier retrieved successfully',
    schema: {
      example: {
        tier: {
          name: 'professional',
          displayName: 'Professional',
          requestsPerDay: 10000,
          requestsPerHour: 2000,
          requestsPerMinute: 100,
          maxConnectors: 20,
          maxUsers: 50,
          enableWebhooks: true,
          enableSso: true,
          enableCustomRoles: true,
          enableAgents: true,
          enableAdvancedBI: true,
          monthlyPrice: 9900,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getOrganizationTier(@Param('orgId') orgId: string) {
    const tier = await this.rateLimitService.getOrganizationTier(orgId);
    return { tier };
  }

  /**
   * Assign tier to organization
   * Platform admin only
   */
  @Post('orgs/:orgId/tier')
  @Roles('owner')
  @SkipRateLimit()
  @ApiOperation({
    summary: 'Assign tier to organization',
    description: 'Assign a rate limit tier to an organization. Platform admin only.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org_abc123',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tierName'],
      properties: {
        tierName: {
          type: 'string',
          enum: ['free', 'starter', 'professional', 'enterprise'],
          description: 'Tier name to assign',
          example: 'professional',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Tier assigned successfully',
    schema: {
      example: {
        tier: { name: 'professional', displayName: 'Professional' },
        message: 'Tier assigned successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Platform admin only' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
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
  @ApiOperation({
    summary: 'Get API usage statistics',
    description: 'Get API usage statistics and rate limit violations for an organization. Owner/Admin only.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org_abc123',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage stats retrieved successfully',
    schema: {
      example: {
        usage: [
          {
            id: 'usage_123',
            endpoint: '/api/v1/connectors',
            method: 'GET',
            requestCount: 45,
            windowStart: '2026-08-08T00:00:00Z',
            windowEnd: '2026-08-09T00:00:00Z',
          },
        ],
        violations: [
          {
            id: 'violation_123',
            endpoint: '/api/v1/connectors/sync',
            method: 'POST',
            tierName: 'Free',
            limit: 100,
            actualCount: 101,
            windowType: 'day',
            blockedAt: '2026-08-08T15:30:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner/Admin only' })
  async getUsageStats(
    @Param('orgId') orgId: string,
    @Body() body?: { days?: number },
  ) {
    const days = body?.days || 30;
    const stats = await this.rateLimitService.getUsageStats(orgId, days);
    return stats;
  }
}
