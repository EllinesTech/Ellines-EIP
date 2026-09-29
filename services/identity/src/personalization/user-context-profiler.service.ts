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

  // ─── Task 11.1 additions ──────────────────────────────────────────────────

  /**
   * Build (or fetch) the context profile for a user in a given org.
   * Mandatory `organizationId` filter on every query — Req 19.1, Tenant Isolation Rule.
   *
   * Returns the existing profile, or creates a sensible default if none exists.
   */
  async buildProfile(
    userId: string,
    orgId: string,
  ): Promise<UserContextProfile> {
    try {
      // Read with mandatory org filter to satisfy tenant isolation.
      const existing = await this.prisma.userContextProfile.findFirst({
        where: { userId, organizationId: orgId },
      });

      if (existing) {
        return existing;
      }

      // Derive role from the user record — fall back to 'member'.
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, title: true },
      });

      const profile = await this.prisma.userContextProfile.create({
        data: {
          userId,
          organizationId: orgId,
          role: user?.role ?? 'member',
          jobTitle: user?.title ?? null,
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
        `buildProfile: created default profile for user ${userId} in org ${orgId}`,
      );
      return profile;
    } catch (error) {
      this.logger.error(
        `buildProfile failed for user ${userId} in org ${orgId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Apply cross-role learning: aggregate `InteractionLog` entries from all users
   * who share `roleType` inside `orgId`, then update `frequentlyUsedFeatures` on
   * every matching `UserContextProfile` with the org-level role average.
   *
   * The aggregation is strictly intra-org (mandatory `organizationId` filter on
   * every query) — cross-org inference is never performed (Req 19.6, Security Rule 6).
   */
  async applyCrossRoleLearning(
    roleType: string,
    orgId: string,
  ): Promise<void> {
    try {
      // 1. Find all context profiles that match the role within this org.
      const profiles = await this.prisma.userContextProfile.findMany({
        where: { role: roleType, organizationId: orgId },
        select: { id: true, frequentlyUsedFeatures: true },
      });

      if (profiles.length === 0) {
        this.logger.log(
          `applyCrossRoleLearning: no profiles for role "${roleType}" in org ${orgId}`,
        );
        return;
      }

      // 2. Fetch interaction logs for those profiles, scoped to this org.
      const profileIds = profiles.map((p) => p.id);
      const logs = await this.prisma.interactionLog.findMany({
        where: {
          contextProfileId: { in: profileIds },
          organizationId: orgId, // mandatory org filter
          interactionType: 'feature_use',
        },
        select: { resourceType: true },
      });

      // 3. Compute frequency map of features across all role members.
      const featureFreq: Record<string, number> = {};
      for (const log of logs) {
        if (log.resourceType) {
          featureFreq[log.resourceType] = (featureFreq[log.resourceType] ?? 0) + 1;
        }
      }

      // 4. Derive the top-10 features ordered by frequency (preference weights).
      const topFeatures = Object.entries(featureFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([feature]) => feature);

      if (topFeatures.length === 0) {
        this.logger.log(
          `applyCrossRoleLearning: no feature_use logs for role "${roleType}" in org ${orgId} — nothing to apply`,
        );
        return;
      }

      // 5. Merge the role-level averages into each profile's frequentlyUsedFeatures.
      //    Explicit per-user features take precedence: we prepend role averages only for
      //    features not already in the user's own top list, maintaining per-user ordering.
      for (const profile of profiles) {
        const userFeatures = profile.frequentlyUsedFeatures as string[];
        const merged = [...userFeatures];
        for (const f of topFeatures) {
          if (!merged.includes(f)) {
            merged.push(f);
          }
        }
        const capped = merged.slice(0, 10);

        await this.prisma.userContextProfile.update({
          where: { id: profile.id },
          data: {
            frequentlyUsedFeatures: capped,
            lastProfiledAt: new Date(),
          },
        });
      }

      this.logger.log(
        `applyCrossRoleLearning: updated ${profiles.length} profile(s) for role "${roleType}" in org ${orgId}`,
      );
    } catch (error) {
      this.logger.error(
        `applyCrossRoleLearning failed for role "${roleType}" in org ${orgId}:`,
        error,
      );
      throw error;
    }
  }
}
