import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  FleetTrackingService,
  FleetLocationFilters,
  GeofenceDefinition,
} from './fleet-tracking.service';

/**
 * Minimal interface extending Express Request with the JWT payload
 * attached by JwtAuthGuard. The organizationId always comes from the
 * JWT token — never from query/body params — for tenant isolation (§6).
 */
interface AuthRequest {
  user: {
    userId: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

/**
 * FleetController — EIP 2.0 Task 16.2
 *
 * All routes prefixed /fleet (combined with the global /api/v1 prefix).
 *
 * Routes:
 *   GET  /fleet/locations                     — real-time asset locations
 *   GET  /fleet/utilization                   — asset utilisation metrics
 *   GET  /fleet/recommendations               — optimisation recommendations
 *   GET  /fleet/:assetId/route-history        — historical GPS route
 *   POST /fleet/geofences                     — create a geofence
 *   POST /fleet/geofences/monitor             — check active geofence violations
 *
 * Security:
 *   - All routes require a valid JWT (JwtAuthGuard).
 *   - organizationId is read exclusively from the JWT (§6 tenant isolation).
 *
 * Requirements: 30.1–30.8
 */
@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetController {
  private readonly logger = new Logger(FleetController.name);

  constructor(private readonly fleetService: FleetTrackingService) {}

  // ── Locations ──────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/fleet/locations
   *
   * Returns the real-time position of all assets for the authenticated org.
   *
   * Query params (all optional):
   *   branchId  — filter by branch
   *   status    — filter by asset status
   *   kind      — filter by asset kind
   *
   * Requirement 30.1
   */
  @Get('locations')
  async getLocations(
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Req() req?: AuthRequest,
  ) {
    const orgId = req!.user.organizationId;

    const filters: FleetLocationFilters = {
      branchId: branchId || undefined,
      status: status || undefined,
      kind: kind || undefined,
    };

    try {
      const assets = await this.fleetService.getRealTimeLocations(orgId, filters);
      return { assets, total: assets.length };
    } catch (err) {
      this.logger.error('[fleet/locations] failed', err);
      return { assets: [], total: 0, error: 'Failed to retrieve asset locations' };
    }
  }

  // ── Route history ──────────────────────────────────────────────────────────

  /**
   * GET /api/v1/fleet/:assetId/route-history
   *
   * Returns the GPS route history for a single asset.
   *
   * Query params:
   *   from  — ISO datetime (defaults to 24 h ago)
   *   to    — ISO datetime (defaults to now)
   *
   * Requirement 30.2
   */
  @Get(':assetId/route-history')
  async getRouteHistory(
    @Param('assetId') assetId: string,
    @Query('from') fromParam?: string,
    @Query('to') toParam?: string,
    @Req() req?: AuthRequest,
  ) {
    const orgId = req!.user.organizationId;

    const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 86_400_000);
    const to = toParam ? new Date(toParam) : new Date();

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return { error: 'Invalid from/to date parameters' };
    }

    try {
      const history = await this.fleetService.getRouteHistory(orgId, assetId, { from, to });
      return history;
    } catch (err) {
      this.logger.error(`[fleet/route-history] assetId=${assetId}`, err);
      return { assetId, orgId, from, to, totalDistance: 0, movingTime: 0, idleTime: 0, stops: [], track: [] };
    }
  }

  // ── Geofences ──────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/fleet/geofences
   *
   * Creates a new geofence for the authenticated organisation.
   *
   * Requirement 30.3
   */
  @Post('geofences')
  async createGeofence(
    @Body() body: GeofenceDefinition,
    @Req() req?: AuthRequest,
  ) {
    const orgId = req!.user.organizationId;

    if (!body.name || !body.name.trim()) {
      return { error: 'name is required' };
    }
    if (!body.type || !['circle', 'polygon'].includes(body.type)) {
      return { error: 'type must be "circle" or "polygon"' };
    }

    try {
      const geofence = await this.fleetService.createGeofence(orgId, body);
      return { geofence };
    } catch (err) {
      this.logger.error('[fleet/geofences] createGeofence failed', err);
      return { error: 'Failed to create geofence' };
    }
  }

  /**
   * POST /api/v1/fleet/geofences/monitor
   *
   * Evaluates current asset positions against active geofences and
   * returns any violations found.
   *
   * Requirement 30.3
   */
  @Post('geofences/monitor')
  async monitorGeofences(@Req() req?: AuthRequest) {
    const orgId = req!.user.organizationId;

    try {
      const violations = await this.fleetService.monitorGeofences(orgId);
      return { violations, count: violations.length };
    } catch (err) {
      this.logger.error('[fleet/geofences/monitor] failed', err);
      return { violations: [], count: 0, error: 'Failed to check geofences' };
    }
  }

  // ── Utilisation ────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/fleet/utilization
   *
   * Returns utilisation metrics for an asset (or org aggregate).
   *
   * Query params:
   *   assetId  — required asset identifier
   *   from     — ISO datetime (defaults to 30 days ago)
   *   to       — ISO datetime (defaults to now)
   *
   * Requirement 30.4
   */
  @Get('utilization')
  async getUtilization(
    @Query('assetId') assetId?: string,
    @Query('from') fromParam?: string,
    @Query('to') toParam?: string,
    @Req() req?: AuthRequest,
  ) {
    const orgId = req!.user.organizationId;

    if (!assetId) {
      return { error: 'assetId query parameter is required' };
    }

    const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 86_400_000);
    const to = toParam ? new Date(toParam) : new Date();

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return { error: 'Invalid from/to date parameters' };
    }

    try {
      const utilization = await this.fleetService.calculateUtilization(orgId, assetId, { from, to });
      return { utilization };
    } catch (err) {
      this.logger.error(`[fleet/utilization] assetId=${assetId}`, err);
      return { error: 'Failed to calculate utilization' };
    }
  }

  // ── Recommendations ────────────────────────────────────────────────────────

  /**
   * GET /api/v1/fleet/recommendations
   *
   * Returns top fleet redeployment recommendations based on utilisation.
   *
   * Requirement 30.5
   */
  @Get('recommendations')
  async getRecommendations(@Req() req?: AuthRequest) {
    const orgId = req!.user.organizationId;

    try {
      const recommendations = await this.fleetService.recommendOptimization(orgId);
      return { recommendations };
    } catch (err) {
      this.logger.error('[fleet/recommendations] failed', err);
      return { recommendations: [], error: 'Failed to generate recommendations' };
    }
  }
}
