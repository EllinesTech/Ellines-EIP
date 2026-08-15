import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PreferenceLearner — Learns user preferences from interactions.
 * Tracks dismissed recommendations, favorite features, and usage patterns.
 *
 * Implements Requirement 19.4:
 * "THE Ellines_EIP SHALL learn user preferences from interactions including
 * dismissed recommendations and favorite features"
 */
@Injectable()
export class PreferenceLearner {
  private readonly logger = new Logger(PreferenceLearner.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a user interaction.
   */
  async logInteraction(
    contextProfileId: string,
    organizationId: string,
    interactionType: string,
    resourceType?: string,
    resourceId?: string,
    contextData: Record<string, any> = {},
    outcome?: string,
    timeSpent?: number,
  ): Promise<void> {
    try {
      await this.prisma.interactionLog.create({
        data: {
          contextProfileId,
          organizationId,
          interactionType,
          resourceType,
          resourceId,
          contextData,
          outcome,
          timeSpent,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to log interaction for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Learn from a user interaction.
   * Updates context profile and preferences based on interaction patterns.
   */
  async learnFromInteraction(
    contextProfileId: string,
    interactionType: string,
    resourceType?: string,
    resourceId?: string,
    outcome?: string,
  ): Promise<void> {
    try {
      const profile = await this.prisma.userContextProfile.findUnique({
        where: { id: contextProfileId },
      });

      if (!profile) {
        return;
      }

      // Learn based on interaction type
      if (interactionType === 'widget_click' && resourceType) {
        // Track widget usage
        const updated = this.updateFrequencyList(
          profile.preferredDashboardWidgets || [],
          resourceType,
          10,
        );
        await this.prisma.userContextProfile.update({
          where: { id: contextProfileId },
          data: {
            preferredDashboardWidgets: updated,
          },
        });
      } else if (interactionType === 'feature_use' && resourceType) {
        // Track feature usage
        const updated = this.updateFrequencyList(
          profile.frequentlyUsedFeatures || [],
          resourceType,
          10,
        );
        await this.prisma.userContextProfile.update({
          where: { id: contextProfileId },
          data: {
            frequentlyUsedFeatures: updated,
          },
        });
      } else if (interactionType === 'data_access' && resourceType) {
        // Track data type access
        const updated = this.updateFrequencyList(
          profile.frequentlyAccessedDataTypes || [],
          resourceType,
          10,
        );
        await this.prisma.userContextProfile.update({
          where: { id: contextProfileId },
          data: {
            frequentlyAccessedDataTypes: updated,
          },
        });
      } else if (interactionType === 'recommendation_dismiss' && resourceId) {
        // Store dismissed recommendation
        await this.setExplicitPreference(
          contextProfileId,
          `dismissed_recommendation_${resourceId}`,
          {
            dismissedAt: new Date(),
            count: 1,
          },
        );
      } else if (interactionType === 'recommendation_accept' && resourceId) {
        // Track accepted recommendations
        await this.setExplicitPreference(
          contextProfileId,
          `accepted_recommendation_${resourceId}`,
          {
            acceptedAt: new Date(),
            count: 1,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to learn from interaction for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Set explicit user preference.
   */
  async setExplicitPreference(
    contextProfileId: string,
    preferenceKey: string,
    preferenceValue: any,
  ): Promise<void> {
    try {
      // Try to update existing preference
      const existing = await this.prisma.userPreference.findUnique({
        where: {
          contextProfileId_preferenceKey: {
            contextProfileId,
            preferenceKey,
          },
        },
      });

      if (existing) {
        await this.prisma.userPreference.update({
          where: { id: existing.id },
          data: { preferenceValue },
        });
      } else {
        await this.prisma.userPreference.create({
          data: {
            contextProfileId,
            preferenceKey,
            preferenceValue,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to set preference ${preferenceKey} for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Get explicit user preference.
   */
  async getExplicitPreference(
    contextProfileId: string,
    preferenceKey: string,
  ): Promise<any> {
    try {
      const pref = await this.prisma.userPreference.findUnique({
        where: {
          contextProfileId_preferenceKey: {
            contextProfileId,
            preferenceKey,
          },
        },
      });

      return pref?.preferenceValue || null;
    } catch (error) {
      this.logger.error(
        `Failed to get preference ${preferenceKey} for profile ${contextProfileId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get all user preferences.
   */
  async getUserPreferences(contextProfileId: string): Promise<Record<string, any>> {
    try {
      const prefs = await this.prisma.userPreference.findMany({
        where: { contextProfileId },
      });

      const result: Record<string, any> = {};
      prefs.forEach((pref) => {
        result[pref.preferenceKey] = pref.preferenceValue;
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get preferences for profile ${contextProfileId}:`,
        error,
      );
      return {};
    }
  }

  /**
   * Check if user has dismissed a recommendation.
   */
  async hasUserDismissedRecommendation(
    contextProfileId: string,
    recommendationId: string,
  ): Promise<boolean> {
    try {
      const dismissed = await this.getExplicitPreference(
        contextProfileId,
        `dismissed_recommendation_${recommendationId}`,
      );

      return !!dismissed;
    } catch (error) {
      this.logger.error(
        `Failed to check dismissed recommendation for profile ${contextProfileId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Analyze user's feature usage patterns.
   */
  async analyzeUsagePatterns(
    contextProfileId: string,
    days = 30,
  ): Promise<{
    mostUsedFeatures: string[];
    mostAccessedData: string[];
    preferredWidgets: string[];
    averageInteractionsPerDay: number;
  }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const interactions = await this.prisma.interactionLog.findMany({
        where: {
          contextProfileId,
          createdAt: {
            gte: cutoffDate,
          },
        },
      });

      // Aggregate usage
      const featureUsage: Record<string, number> = {};
      const dataUsage: Record<string, number> = {};
      const widgetUsage: Record<string, number> = {};

      interactions.forEach((log) => {
        if (log.interactionType === 'feature_use' && log.resourceType) {
          featureUsage[log.resourceType] =
            (featureUsage[log.resourceType] || 0) + 1;
        } else if (log.interactionType === 'data_access' && log.resourceType) {
          dataUsage[log.resourceType] = (dataUsage[log.resourceType] || 0) + 1;
        } else if (log.interactionType === 'widget_click' && log.resourceType) {
          widgetUsage[log.resourceType] =
            (widgetUsage[log.resourceType] || 0) + 1;
        }
      });

      // Sort and get top items
      const mostUsedFeatures = Object.entries(featureUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([feature]) => feature);

      const mostAccessedData = Object.entries(dataUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([data]) => data);

      const preferredWidgets = Object.entries(widgetUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([widget]) => widget);

      const daysPassed = Math.max(days, 1);
      const averageInteractionsPerDay = Math.round(
        interactions.length / daysPassed,
      );

      return {
        mostUsedFeatures,
        mostAccessedData,
        preferredWidgets,
        averageInteractionsPerDay,
      };
    } catch (error) {
      this.logger.error(
        `Failed to analyze usage patterns for profile ${contextProfileId}:`,
        error,
      );
      return {
        mostUsedFeatures: [],
        mostAccessedData: [],
        preferredWidgets: [],
        averageInteractionsPerDay: 0,
      };
    }
  }

  /**
   * Helper: Update frequency list.
   */
  private updateFrequencyList(
    items: string[],
    newItem: string,
    maxItems: number,
  ): string[] {
    const filtered = items.filter((item) => item !== newItem);
    const updated = [newItem, ...filtered].slice(0, maxItems);
    return updated;
  }

  /**
   * Identify feature adoption patterns.
   */
  async getFeatureAdoptionAnalysis(
    contextProfileId: string,
  ): Promise<{
    totalFeaturesExplored: number;
    topFeatures: string[];
    abandonedFeatures: string[];
    engagementScore: number;
  }> {
    try {
      const usagePatterns = await this.analyzeUsagePatterns(
        contextProfileId,
        90,
      );
      const prefs = await this.getUserPreferences(contextProfileId);

      // Count abandoned features (dismissed multiple times)
      const abandonedFeatures = Object.keys(prefs)
        .filter(
          (k) =>
            k.startsWith('dismissed_recommendation_') &&
            prefs[k].count > 2,
        )
        .map((k) => k.replace('dismissed_recommendation_', ''));

      // Calculate engagement score (0-100)
      const engagementScore = Math.min(
        100,
        Math.round(
          usagePatterns.averageInteractionsPerDay * 10 +
            usagePatterns.mostUsedFeatures.length * 5,
        ),
      );

      return {
        totalFeaturesExplored: usagePatterns.mostUsedFeatures.length,
        topFeatures: usagePatterns.mostUsedFeatures,
        abandonedFeatures,
        engagementScore,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get adoption analysis for profile ${contextProfileId}:`,
        error,
      );
      return {
        totalFeaturesExplored: 0,
        topFeatures: [],
        abandonedFeatures: [],
        engagementScore: 0,
      };
    }
  }
}
