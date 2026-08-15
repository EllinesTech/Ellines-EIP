import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPreference } from '@prisma/client';

/**
 * NotificationPreferenceAdjuster — Learns and adjusts notification preferences.
 * Tracks read/ignored/acted-upon patterns and adapts notification delivery.
 *
 * Implements Requirement 19.5:
 * "THE Ellines_EIP SHALL adjust notification preferences based on user response patterns
 * (read, ignored, action taken)"
 */
@Injectable()
export class NotificationPreferenceAdjuster {
  private readonly logger = new Logger(NotificationPreferenceAdjuster.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize notification preferences for a new user.
   */
  async initializeNotificationPreferences(
    userId: string,
    organizationId: string,
  ): Promise<NotificationPreference> {
    try {
      const profile = await this.prisma.userContextProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        throw new Error(`Context profile not found for user ${userId}`);
      }

      const prefs = await this.prisma.notificationPreference.create({
        data: {
          contextProfileId: profile.id,
          organizationId,
          emailNotifications: true,
          inAppNotifications: true,
          pushNotifications: true,
          notificationTypes: {
            approval_pending: { enabled: true, frequency: 'immediate' },
            alert_triggered: { enabled: true, frequency: 'immediate' },
            workflow_completed: { enabled: true, frequency: 'daily' },
            recommendation: { enabled: true, frequency: 'daily' },
            report_ready: { enabled: true, frequency: 'daily' },
          },
          quietHoursStart: '18:00',
          quietHoursEnd: '08:00',
          quietHoursEnabled: false,
          readRate: 0.5,
          ignoredRate: 0.3,
          actedUponRate: 0.2,
        },
      });

      this.logger.log(
        `Initialized notification preferences for user ${userId}`,
      );
      return prefs;
    } catch (error) {
      this.logger.error(
        `Failed to initialize notification preferences for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get notification preferences for a user.
   */
  async getNotificationPreferences(
    contextProfileId: string,
  ): Promise<NotificationPreference | null> {
    try {
      return await this.prisma.notificationPreference.findUnique({
        where: { contextProfileId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get notification preferences for profile ${contextProfileId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Update notification preferences explicitly.
   */
  async updateNotificationPreferences(
    contextProfileId: string,
    updates: Record<string, any>,
  ): Promise<void> {
    try {
      const prefs = await this.prisma.notificationPreference.findUnique({
        where: { contextProfileId },
      });

      if (!prefs) {
        return;
      }

      const data: any = {};
      if (updates.emailNotifications !== undefined) {
        data.emailNotifications = updates.emailNotifications;
      }
      if (updates.inAppNotifications !== undefined) {
        data.inAppNotifications = updates.inAppNotifications;
      }
      if (updates.pushNotifications !== undefined) {
        data.pushNotifications = updates.pushNotifications;
      }
      if (updates.quietHoursStart !== undefined) {
        data.quietHoursStart = updates.quietHoursStart;
      }
      if (updates.quietHoursEnd !== undefined) {
        data.quietHoursEnd = updates.quietHoursEnd;
      }
      if (updates.quietHoursEnabled !== undefined) {
        data.quietHoursEnabled = updates.quietHoursEnabled;
      }
      if (updates.notificationTypes !== undefined) {
        data.notificationTypes = {
          ...(prefs.notificationTypes as Record<string, any>),
          ...updates.notificationTypes,
        };
      }

      if (Object.keys(data).length > 0) {
        await this.prisma.notificationPreference.update({
          where: { id: prefs.id },
          data,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to update notification preferences for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Update notification patterns based on user interaction.
   * Called when user reads, ignores, or acts on notifications.
   */
  async updateNotificationPatterns(
    contextProfileId: string,
    interactionType: string,
    notificationType?: string,
  ): Promise<void> {
    try {
      const prefs = await this.prisma.notificationPreference.findUnique({
        where: { contextProfileId },
      });

      if (!prefs) {
        return;
      }

      let newReadRate = prefs.readRate;
      let newIgnoredRate = prefs.ignoredRate;
      let newActedUponRate = prefs.actedUponRate;

      // Update rates based on interaction
      if (interactionType === 'notification_read') {
        newReadRate = this.updateRate(prefs.readRate, true);
        if (notificationType) {
          await this.updateNotificationTypeFrequency(
            contextProfileId,
            notificationType,
            'increase',
          );
        }
      } else if (interactionType === 'notification_ignored') {
        newIgnoredRate = this.updateRate(prefs.ignoredRate, true);
        if (notificationType) {
          await this.updateNotificationTypeFrequency(
            contextProfileId,
            notificationType,
            'decrease',
          );
        }
      } else if (interactionType === 'notification_acted_upon') {
        newActedUponRate = this.updateRate(prefs.actedUponRate, true);
        if (notificationType) {
          await this.updateNotificationTypeFrequency(
            contextProfileId,
            notificationType,
            'increase',
          );
        }
      }

      // Normalize rates
      const total = newReadRate + newIgnoredRate + newActedUponRate;
      const normalized = {
        readRate: newReadRate / total,
        ignoredRate: newIgnoredRate / total,
        actedUponRate: newActedUponRate / total,
        lastLearningAt: new Date(),
      };

      await this.prisma.notificationPreference.update({
        where: { id: prefs.id },
        data: normalized,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update notification patterns for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Update notification type frequency (e.g., approval_pending).
   */
  private async updateNotificationTypeFrequency(
    contextProfileId: string,
    notificationType: string,
    direction: 'increase' | 'decrease',
  ): Promise<void> {
    try {
      const prefs = await this.prisma.notificationPreference.findUnique({
        where: { contextProfileId },
      });

      if (!prefs) {
        return;
      }

      const types = (prefs.notificationTypes || {}) as Record<string, any>;
      const typeConfig = types[notificationType] || {
        enabled: true,
        frequency: 'daily',
      };

      // Adjust frequency based on user engagement
      const frequencyLevels = [
        'never',
        'weekly',
        'daily',
        'hourly',
        'immediate',
      ];
      let currentIndex = frequencyLevels.indexOf(typeConfig.frequency);

      if (direction === 'increase' && currentIndex < frequencyLevels.length - 1) {
        currentIndex++;
      } else if (direction === 'decrease' && currentIndex > 0) {
        currentIndex--;
      }

      types[notificationType] = {
        enabled: currentIndex !== 0, // Disable if set to 'never'
        frequency: frequencyLevels[currentIndex],
      };

      await this.prisma.notificationPreference.update({
        where: { id: prefs.id },
        data: { notificationTypes: types },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update notification type frequency for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Check if a user should receive a notification.
   * Considers enabled state, quiet hours, and frequency.
   */
  async shouldSendNotification(
    contextProfileId: string,
    notificationType: string,
  ): Promise<boolean> {
    try {
      const prefs = await this.prisma.notificationPreference.findUnique({
        where: { contextProfileId },
      });

      if (!prefs) {
        return false;
      }

      // Check if notifications are enabled at all
      if (
        !prefs.emailNotifications &&
        !prefs.inAppNotifications &&
        !prefs.pushNotifications
      ) {
        return false;
      }

      // Check quiet hours
      if (prefs.quietHoursEnabled) {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const currentTime = hour * 100 + minute;

        const [startHour, startMin] = (prefs.quietHoursStart || '00:00')
          .split(':')
          .map(Number);
        const [endHour, endMin] = (prefs.quietHoursEnd || '00:00')
          .split(':')
          .map(Number);

        const startTime = startHour * 100 + startMin;
        const endTime = endHour * 100 + endMin;

        if (startTime > endTime) {
          // Quiet hours span midnight
          if (currentTime >= startTime || currentTime < endTime) {
            return false;
          }
        } else {
          // Normal quiet hours
          if (currentTime >= startTime && currentTime < endTime) {
            return false;
          }
        }
      }

      // Check notification type settings
      const types = (prefs.notificationTypes || {}) as Record<string, any>;
      const typeConfig = types[notificationType];

      if (!typeConfig || !typeConfig.enabled) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to check if notification should be sent for profile ${contextProfileId}:`,
        error,
      );
      return true; // Default to sending
    }
  }

  /**
   * Get recommended notification frequency based on user patterns.
   */
  async getRecommendedFrequency(
    contextProfileId: string,
    notificationType: string,
  ): Promise<string> {
    try {
      const prefs = await this.prisma.notificationPreference.findUnique({
        where: { contextProfileId },
      });

      if (!prefs) {
        return 'daily';
      }

      // Adjust frequency based on read/ignored rates
      if (prefs.ignoredRate > 0.6) {
        return 'weekly'; // User ignores most notifications
      } else if (prefs.readRate > 0.7 && prefs.actedUponRate > 0.5) {
        return 'immediate'; // User reads and acts on notifications
      } else if (prefs.readRate > 0.5) {
        return 'daily'; // User reads most
      }

      return 'daily'; // Default
    } catch (error) {
      this.logger.error(
        `Failed to get recommended frequency for profile ${contextProfileId}:`,
        error,
      );
      return 'daily';
    }
  }

  /**
   * Helper: Update a rate value based on exponential moving average.
   */
  private updateRate(currentRate: number, increase: boolean): number {
    const alpha = 0.1; // Learning rate
    const target = increase ? 1 : 0;
    return currentRate + alpha * (target - currentRate);
  }

  /**
   * Analyze notification effectiveness.
   */
  async analyzeNotificationEffectiveness(
    contextProfileId: string,
  ): Promise<{
    effectivenessScore: number;
    readRate: number;
    ignoredRate: number;
    actedUponRate: number;
    recommendation: string;
  }> {
    try {
      const prefs = await this.prisma.notificationPreference.findUnique({
        where: { contextProfileId },
      });

      if (!prefs) {
        return {
          effectivenessScore: 50,
          readRate: 0.33,
          ignoredRate: 0.33,
          actedUponRate: 0.33,
          recommendation: 'Monitor notification patterns',
        };
      }

      // Calculate effectiveness score (0-100)
      const effectivenessScore = Math.round(
        prefs.readRate * 50 + prefs.actedUponRate * 50,
      );

      // Generate recommendation
      let recommendation = 'Notification preferences are optimal';
      if (prefs.ignoredRate > 0.6) {
        recommendation =
          'Consider reducing notification frequency or enabling quiet hours';
      } else if (prefs.actedUponRate < 0.2) {
        recommendation =
          'Notifications are not resulting in action. Consider adjusting notification types';
      }

      return {
        effectivenessScore,
        readRate: prefs.readRate,
        ignoredRate: prefs.ignoredRate,
        actedUponRate: prefs.actedUponRate,
        recommendation,
      };
    } catch (error) {
      this.logger.error(
        `Failed to analyze notification effectiveness for profile ${contextProfileId}:`,
        error,
      );
      return {
        effectivenessScore: 50,
        readRate: 0.33,
        ignoredRate: 0.33,
        actedUponRate: 0.33,
        recommendation: 'Unable to analyze patterns',
      };
    }
  }
}
