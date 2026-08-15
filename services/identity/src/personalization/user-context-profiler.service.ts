import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextProfile } from '@prisma/client';

/**
 * UserContextProfiler — Builds and maintains user context profiles.
 * Tracks role, department, frequently accessed data, and interaction patterns.
 *
 * Implements Requirement 19.1:
 * "THE Ellines_EIP SHALL build user context profiles including role, department,
 * frequently accessed data, and interaction patterns"
 */
@Injectable()
export class UserContextProfiler {
  private readonly logger = new Logger(UserContextProfiler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create initial context profile for a new user.
   */
  async createContextProfile(
    userId: string,
    organizationId: string,
    userRole: string,
  ): Promise<UserContextProfile> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const profile = await this.prisma.userContextProfile.create({
        data: {
          userId,
          organizationId,
          role: userRole,
          department: null,
          jobTitle: user.title || null,
          frequentlyAccessedDataTypes: [],
          frequentlyUsedFeatures: [],
          preferredDashboardWidgets: [],
          totalLogins: 0,
          averageSessionTime: 0,
          preferredLanguage: 'en',
          preferredTimezone: 'UTC',
          verbosityLevel: 'medium',
          preferredTerminology: 'business',
        },
      });

      this.logger.log(
        `Created context profile for user ${userId} in org ${organizationId}`,
      );
      return profile;
    } catch (error) {
      this.logger.error(
        `Failed to create context profile for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get context profile for a user.
   */
  async getContextProfile(userId: string): Promise<UserContextProfile | null> {
    try {
      return await this.prisma.userContextProfile.findUnique({
        where: { userId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get context profile for user ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Update user's accessed data types based on interaction.
   * Used to track frequently accessed data types.
   */
  async updateAccessedDataTypes(
    contextProfileId: string,
    dataType: string,
  ): Promise<void> {
    try {
      const profile = await this.prisma.userContextProfile.findUnique({
        where: { id: contextProfileId },
      });

      if (!profile) {
        return;
      }

      const dataTypes = profile.frequentlyAccessedDataTypes || [];
      const updatedTypes = this.updateFrequencyList(dataTypes, dataType, 10);

      await this.prisma.userContextProfile.update({
        where: { id: contextProfileId },
        data: {
          frequentlyAccessedDataTypes: updatedTypes,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update accessed data types for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Update user's used features based on interaction.
   * Used to track frequently used features.
   */
  async updateUsedFeatures(
    contextProfileId: string,
    feature: string,
  ): Promise<void> {
    try {
      const profile = await this.prisma.userContextProfile.findUnique({
        where: { id: contextProfileId },
      });

      if (!profile) {
        return;
      }

      const features = profile.frequentlyUsedFeatures || [];
      const updatedFeatures = this.updateFrequencyList(features, feature, 10);

      await this.prisma.userContextProfile.update({
        where: { id: contextProfileId },
        data: {
          frequentlyUsedFeatures: updatedFeatures,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update used features for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Update preferred dashboard widgets.
   * Used to track which widget types user interacts with most.
   */
  async updatePreferredWidgets(
    contextProfileId: string,
    widgetType: string,
  ): Promise<void> {
    try {
      const profile = await this.prisma.userContextProfile.findUnique({
        where: { id: contextProfileId },
      });

      if (!profile) {
        return;
      }

      const widgets = profile.preferredDashboardWidgets || [];
      const updatedWidgets = this.updateFrequencyList(widgets, widgetType, 10);

      await this.prisma.userContextProfile.update({
        where: { id: contextProfileId },
        data: {
          preferredDashboardWidgets: updatedWidgets,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update preferred widgets for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Update user login metrics.
   * Called when user logs in successfully.
   */
  async recordLogin(contextProfileId: string): Promise<void> {
    try {
      const profile = await this.prisma.userContextProfile.findUnique({
        where: { id: contextProfileId },
      });

      if (!profile) {
        return;
      }

      // Update login count and last login
      await this.prisma.userContextProfile.update({
        where: { id: contextProfileId },
        data: {
          totalLogins: profile.totalLogins + 1,
          lastLoginAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record login for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Update session time metrics.
   * Called when user session ends.
   */
  async recordSessionTime(
    contextProfileId: string,
    sessionDurationSeconds: number,
  ): Promise<void> {
    try {
      const profile = await this.prisma.userContextProfile.findUnique({
        where: { id: contextProfileId },
      });

      if (!profile) {
        return;
      }

      // Calculate new average
      const newAverage = Math.round(
        (profile.averageSessionTime * profile.totalLogins +
          sessionDurationSeconds) /
          (profile.totalLogins + 1),
      );

      await this.prisma.userContextProfile.update({
        where: { id: contextProfileId },
        data: {
          averageSessionTime: newAverage,
          lastProfiledAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record session time for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Update AI response preferences.
   * Called when user changes their preferred verbosity or terminology.
   */
  async updateResponsePreferences(
    contextProfileId: string,
    updates: {
      verbosityLevel?: 'concise' | 'medium' | 'detailed';
      preferredTerminology?: 'technical' | 'business' | 'simple';
    },
  ): Promise<void> {
    try {
      const profile = await this.prisma.userContextProfile.findUnique({
        where: { id: contextProfileId },
      });

      if (!profile) {
        return;
      }

      const data: any = {};
      if (updates.verbosityLevel) {
        data.verbosityLevel = updates.verbosityLevel;
      }
      if (updates.preferredTerminology) {
        data.preferredTerminology = updates.preferredTerminology;
      }

      if (Object.keys(data).length > 0) {
        await this.prisma.userContextProfile.update({
          where: { id: contextProfileId },
          data,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to update response preferences for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Refresh user context profile.
   * Recalculates stats and refreshes role/department info.
   */
  async refreshContextProfile(
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

      const profile = await this.prisma.userContextProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        await this.createContextProfile(userId, organizationId, user.role);
        return;
      }

      // Update role if changed
      await this.prisma.userContextProfile.update({
        where: { id: profile.id },
        data: {
          role: user.role,
          jobTitle: user.title || null,
          lastProfiledAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to refresh context profile for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Helper: Update frequency list (e.g., for top items).
   * Maintains a ranked list of frequently used items, keeping only top N.
   */
  private updateFrequencyList(
    items: string[],
    newItem: string,
    maxItems: number,
  ): string[] {
    // Simple frequency tracking: move item to front if exists, add if new
    const filtered = items.filter((item) => item !== newItem);
    const updated = [newItem, ...filtered].slice(0, maxItems);
    return updated;
  }
}
