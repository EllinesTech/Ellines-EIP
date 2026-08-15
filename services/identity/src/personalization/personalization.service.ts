import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextProfiler } from './user-context-profiler.service';
import { AdaptiveDashboardGenerator } from './adaptive-dashboard-generator.service';
import { AiResponseTailor } from './ai-response-tailor.service';
import { PreferenceLearner } from './preference-learner.service';
import { NotificationPreferenceAdjuster } from './notification-preference-adjuster.service';
import { ContextAwareShortcutSuggester } from './context-aware-shortcut-suggester.service';

/**
 * PersonalizationService — Main orchestrator for user personalization.
 * Coordinates context profiling, preference learning, dashboard adaptation,
 * and notification management to provide personalized experiences.
 *
 * Implements Requirements 19.1-19.8:
 * - 19.1: Build user context profiles (role, department, access patterns)
 * - 19.2: Adapt dashboard content based on user context
 * - 19.3: Tailor AI responses by user role and context
 * - 19.4: Learn user preferences from interactions
 * - 19.5: Adjust notification preferences based on user response patterns
 * - 19.6: Provide context-aware shortcuts suggesting next actions
 * - 19.7: Respect explicit user preferences overriding learned behaviors
 * - 19.8: Apply federated learning for cross-user personalization
 */
@Injectable()
export class PersonalizationService {
  private readonly logger = new Logger(PersonalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextProfiler: UserContextProfiler,
    private readonly dashboardGenerator: AdaptiveDashboardGenerator,
    private readonly responseTailor: AiResponseTailor,
    private readonly preferenceLearner: PreferenceLearner,
    private readonly notificationAdjuster: NotificationPreferenceAdjuster,
    private readonly shortcutSuggester: ContextAwareShortcutSuggester,
  ) {}

  /**
   * Initialize personalization for a new user.
   * Creates initial context profile with role and department.
   * Called during user creation.
   */
  async initializeUserPersonalization(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Create initial context profile
      await this.contextProfiler.createContextProfile(
        userId,
        organizationId,
        user.role,
      );

      // Create notification preferences
      await this.notificationAdjuster.initializeNotificationPreferences(
        userId,
        organizationId,
      );

      this.logger.log(
        `Personalization initialized for user ${userId} in org ${organizationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize personalization for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Track a user interaction for learning preferences.
   * Examples: clicked widget, dismissed recommendation, accessed data.
   */
  async trackInteraction(
    userId: string,
    organizationId: string,
    interactionType: string,
    resourceType?: string,
    resourceId?: string,
    contextData?: Record<string, any>,
    outcome?: string,
    timeSpent?: number,
  ): Promise<void> {
    try {
      // Get or create context profile
      let profile = await this.prisma.userContextProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
        });
        await this.initializeUserPersonalization(userId, organizationId);
        profile = await this.prisma.userContextProfile.findUnique({
          where: { userId },
        });
      }

      if (!profile) {
        this.logger.error(`Failed to get or create profile for user ${userId}`);
        return;
      }

      // Log the interaction
      await this.preferenceLearner.logInteraction(
        profile.id,
        organizationId,
        interactionType,
        resourceType,
        resourceId,
        contextData || {},
        outcome,
        timeSpent,
      );

      // Learn from interaction
      await this.preferenceLearner.learnFromInteraction(
        profile.id,
        interactionType,
        resourceType,
        resourceId,
        outcome,
      );

      // Adjust notification preferences if relevant
      if (
        interactionType === 'notification_read' ||
        interactionType === 'notification_ignored' ||
        interactionType === 'notification_acted_upon'
      ) {
        await this.notificationAdjuster.updateNotificationPatterns(
          profile.id,
          interactionType,
          resourceType,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to track interaction for user ${userId}:`,
        error,
      );
      // Don't throw - interaction tracking should not break main flow
    }
  }

  /**
   * Get personalized dashboard recommendations.
   * Returns adaptive widgets and layout based on user context and preferences.
   */
  async getPersonalizedDashboard(
    userId: string,
    organizationId: string,
    dashboardId?: string,
  ): Promise<any> {
    try {
      const profile = await this.contextProfiler.getContextProfile(userId);

      if (!profile) {
        this.logger.warn(
          `No context profile found for user ${userId}, returning default dashboard`,
        );
        return null;
      }

      // Get adaptive dashboard content
      const personalizedDashboard =
        await this.dashboardGenerator.generateAdaptiveDashboard(
          profile,
          organizationId,
          dashboardId,
        );

      return personalizedDashboard;
    } catch (error) {
      this.logger.error(
        `Failed to get personalized dashboard for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get tailored AI response based on user context.
   * Adjusts verbosity, terminology, and focus based on role and preferences.
   */
  async getTailoredAiResponse(
    userId: string,
    baseResponse: string,
    responseType?: string,
  ): Promise<string> {
    try {
      const profile = await this.contextProfiler.getContextProfile(userId);

      if (!profile) {
        return baseResponse;
      }

      // Tailor response based on user context
      const tailoredResponse = await this.responseTailor.tailorResponse(
        baseResponse,
        profile,
        responseType,
      );

      return tailoredResponse;
    } catch (error) {
      this.logger.error(
        `Failed to tailor AI response for user ${userId}:`,
        error,
      );
      return baseResponse; // Fallback to base response
    }
  }

  /**
   * Get context-aware shortcut suggestions.
   * Returns likely next actions based on user history and current context.
   */
  async getContextAwareShortcuts(
    userId: string,
    organizationId: string,
    limit = 5,
  ): Promise<any[]> {
    try {
      const profile = await this.contextProfiler.getContextProfile(userId);

      if (!profile) {
        return [];
      }

      // Generate shortcut suggestions
      const shortcuts = await this.shortcutSuggester.generateShortcuts(
        profile,
        organizationId,
        limit,
      );

      return shortcuts;
    } catch (error) {
      this.logger.error(
        `Failed to get shortcuts for user ${userId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get notification preferences for a user.
   * Returns learned preferences including channel and type preferences.
   */
  async getNotificationPreferences(userId: string): Promise<any> {
    try {
      const profile = await this.contextProfiler.getContextProfile(userId);

      if (!profile) {
        return null;
      }

      const preferences =
        await this.notificationAdjuster.getNotificationPreferences(profile.id);

      return preferences;
    } catch (error) {
      this.logger.error(
        `Failed to get notification preferences for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update explicit user preference, overriding learned behaviors.
   * Used when user explicitly sets preferences that should take precedence.
   */
  async updateUserPreference(
    userId: string,
    preferenceKey: string,
    preferenceValue: any,
  ): Promise<void> {
    try {
      const profile = await this.contextProfiler.getContextProfile(userId);

      if (!profile) {
        throw new Error(`Context profile not found for user ${userId}`);
      }

      await this.preferenceLearner.setExplicitPreference(
        profile.id,
        preferenceKey,
        preferenceValue,
      );

      this.logger.log(
        `Updated preference ${preferenceKey} for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update preference for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update notification preferences explicitly.
   * Allows user to override learned notification behavior.
   */
  async updateNotificationPreferences(
    userId: string,
    updates: Record<string, any>,
  ): Promise<void> {
    try {
      const profile = await this.contextProfiler.getContextProfile(userId);

      if (!profile) {
        throw new Error(`Context profile not found for user ${userId}`);
      }

      await this.notificationAdjuster.updateNotificationPreferences(
        profile.id,
        updates,
      );

      this.logger.log(`Updated notification preferences for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to update notification preferences for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Refresh user context profile.
   * Updates role, department, and recalculates behavioral patterns.
   * Called periodically or when user role changes.
   */
  async refreshUserContext(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.contextProfiler.refreshContextProfile(
        userId,
        organizationId,
      );

      this.logger.log(`Refreshed context profile for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to refresh context profile for user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}
