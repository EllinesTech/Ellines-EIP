import { Controller, Post, Get, Put, Body, Param, UseGuards, Logger, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PersonalizationService } from './personalization.service';

interface AuthRequest {
  user: {
    userId: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

/**
 * PersonalizationController — REST API for personalization service.
 * Provides endpoints for dashboard adaptation, preference management,
 * and context-aware shortcuts.
 */
@Controller('personalization')
@UseGuards(AuthGuard('jwt'))
export class PersonalizationController {
  private readonly logger = new Logger(PersonalizationController.name);

  constructor(private readonly personalizationService: PersonalizationService) {}

  /**
   * GET /personalization/profile/:userId
   * Get user's context profile and personalization data.
   */
  @Get('profile/:userId')
  async getUserProfile(
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    try {
      const profile = await this.personalizationService.getPersonalizedDashboard(
        userId,
        req.user.organizationId,
      );

      return {
        success: true,
        data: profile,
      };
    } catch (error) {
      this.logger.error(`Failed to get user profile for ${userId}:`, error);
      return {
        success: false,
        error: 'Failed to retrieve user profile',
      };
    }
  }

  /**
   * GET /personalization/dashboard/:userId
   * Get personalized dashboard content for user.
   * Returns adaptive widgets and layout based on user context.
   */
  @Get('dashboard/:userId')
  async getPersonalizedDashboard(
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    try {
      const dashboard = await this.personalizationService.getPersonalizedDashboard(
        userId,
        req.user.organizationId,
      );

      return {
        success: true,
        data: dashboard,
      };
    } catch (error) {
      this.logger.error(`Failed to get personalized dashboard for ${userId}:`, error);
      return {
        success: false,
        error: 'Failed to retrieve personalized dashboard',
      };
    }
  }

  /**
   * POST /personalization/tailor-response
   * Get AI response tailored to user's role and context.
   * Request body: { userId, baseResponse, responseType? }
   */
  @Post('tailor-response')
  async getTailoredResponse(
    @Body() body: { userId: string; baseResponse: string; responseType?: string },
    @Req() req: AuthRequest,
  ) {
    try {
      const { userId, baseResponse, responseType } = body;

      const tailored = await this.personalizationService.getTailoredAiResponse(
        userId,
        baseResponse,
        responseType,
      );

      return {
        success: true,
        data: {
          originalResponse: baseResponse,
          tailoredResponse: tailored,
          tailored: tailored !== baseResponse,
        },
      };
    } catch (error) {
      this.logger.error('Failed to tailor response:', error);
      return {
        success: false,
        error: 'Failed to tailor response',
      };
    }
  }

  /**
   * GET /personalization/shortcuts?userId=...&limit=...
   * Get context-aware shortcut suggestions for user.
   */
  @Get('shortcuts')
  async getShortcuts(
    @Param() params: { userId: string; limit?: number },
    @Req() req: AuthRequest,
  ) {
    try {
      const userId = params.userId || req.user.userId;
      const limit = params.limit || 5;

      const shortcuts = await this.personalizationService.getContextAwareShortcuts(
        userId,
        req.user.organizationId,
        limit,
      );

      return {
        success: true,
        data: shortcuts,
      };
    } catch (error) {
      this.logger.error('Failed to get shortcuts:', error);
      return {
        success: false,
        error: 'Failed to retrieve shortcuts',
      };
    }
  }

  /**
   * GET /personalization/notifications/:userId
   * Get user's notification preferences.
   */
  @Get('notifications/:userId')
  async getNotificationPreferences(
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    try {
      const prefs = await this.personalizationService.getNotificationPreferences(
        userId,
      );

      return {
        success: true,
        data: prefs,
      };
    } catch (error) {
      this.logger.error(`Failed to get notification preferences for ${userId}:`, error);
      return {
        success: false,
        error: 'Failed to retrieve notification preferences',
      };
    }
  }

  /**
   * POST /personalization/interactions
   * Track a user interaction for learning preferences.
   * Request body: { userId, interactionType, resourceType?, resourceId?, outcome?, timeSpent? }
   */
  @Post('interactions')
  async trackInteraction(
    @Body()
    body: {
      userId: string;
      interactionType: string;
      resourceType?: string;
      resourceId?: string;
      outcome?: string;
      timeSpent?: number;
      contextData?: Record<string, any>;
    },
    @Req() req: AuthRequest,
  ) {
    try {
      const {
        userId,
        interactionType,
        resourceType,
        resourceId,
        outcome,
        timeSpent,
        contextData,
      } = body;

      await this.personalizationService.trackInteraction(
        userId,
        req.user.organizationId,
        interactionType,
        resourceType,
        resourceId,
        contextData,
        outcome,
        timeSpent,
      );

      return {
        success: true,
        message: 'Interaction tracked successfully',
      };
    } catch (error) {
      this.logger.error('Failed to track interaction:', error);
      // Don't throw error - interaction tracking should not break main flow
      return {
        success: false,
        error: 'Failed to track interaction',
      };
    }
  }

  /**
   * PUT /personalization/preferences/:userId
   * Update explicit user preference.
   * Request body: { preferenceKey, preferenceValue }
   */
  @Put('preferences/:userId')
  async updatePreference(
    @Param('userId') userId: string,
    @Body() body: { preferenceKey: string; preferenceValue: any },
    @Req() req: AuthRequest,
  ) {
    try {
      const { preferenceKey, preferenceValue } = body;

      await this.personalizationService.updateUserPreference(
        userId,
        preferenceKey,
        preferenceValue,
      );

      return {
        success: true,
        message: 'Preference updated successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to update preference for ${userId}:`,
        error,
      );
      return {
        success: false,
        error: 'Failed to update preference',
      };
    }
  }

  /**
   * PUT /personalization/notifications/:userId
   * Update notification preferences.
   * Request body: { emailNotifications?, inAppNotifications?, pushNotifications?, quietHours?, notificationTypes? }
   */
  @Put('notifications/:userId')
  async updateNotificationPreferences(
    @Param('userId') userId: string,
    @Body() body: Record<string, any>,
    @Req() req: AuthRequest,
  ) {
    try {
      await this.personalizationService.updateNotificationPreferences(
        userId,
        body,
      );

      return {
        success: true,
        message: 'Notification preferences updated successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to update notification preferences for ${userId}:`,
        error,
      );
      return {
        success: false,
        error: 'Failed to update notification preferences',
      };
    }
  }

  /**
   * POST /personalization/refresh/:userId
   * Refresh user's context profile.
   * Called when user role changes or periodic refresh needed.
   */
  @Post('refresh/:userId')
  async refreshContext(
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    try {
      await this.personalizationService.refreshUserContext(
        userId,
        req.user.organizationId,
      );

      return {
        success: true,
        message: 'User context refreshed successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to refresh context for ${userId}:`,
        error,
      );
      return {
        success: false,
        error: 'Failed to refresh context',
      };
    }
  }

  /**
   * POST /personalization/initialize/:userId
   * Initialize personalization for a new user.
   * Called during user creation.
   */
  @Post('initialize/:userId')
  async initializePersonalization(
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    try {
      await this.personalizationService.initializeUserPersonalization(
        userId,
        req.user.organizationId,
      );

      return {
        success: true,
        message: 'Personalization initialized successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to initialize personalization for ${userId}:`,
        error,
      );
      return {
        success: false,
        error: 'Failed to initialize personalization',
      };
    }
  }
}
