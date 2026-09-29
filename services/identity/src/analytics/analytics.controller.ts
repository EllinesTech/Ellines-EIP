/**
 * AnalyticsController
 *
 * Exposes predictive analytics over HTTP so the Cloudflare Pages Functions
 * (apps/web/functions/api/v1/orgs/[slug]/analytics/forecast.ts and
 *  apps/web/functions/api/v1/orgs/[slug]/analytics/scenarios.ts) can call
 * them internally.
 *
 * GET /api/v1/ellinea/analytics/forecast
 *   Query: { metric: string; horizon?: number; orgId: string }
 *   Returns: ForecastResult
 *
 * GET /api/v1/ellinea/analytics/scenarios
 *   Query: { metric: string; currentValue: number; trend?: string; orgId: string }
 *   Returns: Scenario[]
 *
 * Both endpoints are protected by JwtAuthGuard.  The Pages Function that
 * calls these already enforces owner/admin role; the controller trusts the
 * JWT and uses the explicit `orgId` query param as the tenant scope
 * (mandatory `organization_id` filter — Security Rule §6).
 *
 * Requirements: 11.1, 7.5, 9.4
 */

import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PredictiveAnalyticsService,
  ForecastResult,
  Scenario,
} from './predictive-analytics.service';

@Controller('ellinea/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly predictiveAnalytics: PredictiveAnalyticsService,
  ) {}

  /**
   * GET /api/v1/ellinea/analytics/forecast
   *
   * Returns a day-by-day ForecastResult for `metric` over `horizon` days.
   *
   * @param metric  InfluxDB measurement / field name (required)
   * @param horizon Number of future days to project (default 30, max 365)
   * @param orgId   Organisation scope — mandatory tenant filter (required)
   */
  @Get('forecast')
  async forecast(
    @Query('metric') metric: string,
    @Query('horizon') horizonRaw: string | undefined,
    @Query('orgId') orgId: string,
  ): Promise<ForecastResult> {
    if (!orgId) {
      throw new BadRequestException('orgId query parameter is required');
    }
    if (!metric) {
      throw new BadRequestException('metric query parameter is required');
    }

    const horizon = horizonRaw !== undefined ? parseInt(horizonRaw, 10) : 30;
    if (isNaN(horizon) || horizon < 1 || horizon > 365) {
      throw new BadRequestException('horizon must be between 1 and 365');
    }

    this.logger.log(
      `forecast orgId=${orgId} metric=${metric} horizon=${horizon}`,
    );

    return this.predictiveAnalytics.forecast(orgId, metric, horizon);
  }

  /**
   * GET /api/v1/ellinea/analytics/scenarios
   *
   * Returns best-case, most-likely, and worst-case Scenario objects.
   * Probabilities sum to exactly 1.0.
   *
   * @param metric        Metric name (required)
   * @param currentValue  Current observed value (required, numeric)
   * @param trend         Direction hint: 'up' | 'down' | 'stable' (default 'stable')
   * @param orgId         Organisation scope — mandatory tenant filter (required)
   */
  @Get('scenarios')
  async scenarios(
    @Query('metric') metric: string,
    @Query('currentValue') currentValueRaw: string,
    @Query('trend') trend: string | undefined,
    @Query('orgId') orgId: string,
  ): Promise<Scenario[]> {
    if (!orgId) {
      throw new BadRequestException('orgId query parameter is required');
    }
    if (!metric) {
      throw new BadRequestException('metric query parameter is required');
    }
    if (currentValueRaw === undefined || currentValueRaw === null) {
      throw new BadRequestException('currentValue query parameter is required');
    }

    const currentValue = parseFloat(currentValueRaw);
    if (isNaN(currentValue)) {
      throw new BadRequestException('currentValue must be a valid number');
    }

    const normalizedTrend = (trend ?? 'stable') as 'up' | 'down' | 'stable';
    if (!['up', 'down', 'stable'].includes(normalizedTrend)) {
      throw new BadRequestException("trend must be 'up', 'down', or 'stable'");
    }

    this.logger.log(
      `scenarios orgId=${orgId} metric=${metric} currentValue=${currentValue} trend=${normalizedTrend}`,
    );

    return this.predictiveAnalytics.generateScenarios(orgId, {
      metric,
      currentValue,
      trend: normalizedTrend,
    });
  }
}
