import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextProfile } from '@prisma/client';

/**
 * ContextAwareShortcutSuggester — Suggests next likely actions.
 * Analyzes user context and history to recommend shortcuts and next steps.
 *
 * Implements Requirement 19.6:
 * "THE Ellines_EIP SHALL provide context-aware shortcuts suggesting next likely actions"
 */
@Injectable()
export class ContextAwareShortcutSuggester {
  private readonly logger = new Logger(ContextAwareShortcutSuggester.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate context-aware shortcut suggestions.
   * Returns likely next actions based on user's role, history, and current context.
   */
  async generateShortcuts(
    profile: UserContextProfile,
    organizationId: string,
    limit = 5,
  ): Promise<any[]> {
    try {
      // Get user's interaction history
      const interactions = await this.prisma.interactionLog.findMany({
        where: {
          contextProfileId: profile.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50, // Last 50 interactions
      });

      if (interactions.length === 0) {
        return this.getDefaultShortcuts(profile.role, limit);
      }

      // Analyze interaction patterns
      const patterns = this.analyzeInteractionPatterns(interactions);

      // Generate shortcuts based on patterns
      const suggestions = this.generateSuggestionsFromPatterns(
        patterns,
        profile,
        limit,
      );

      // Rank by relevance
      const ranked = this.rankShortcuts(suggestions, profile);

      return ranked.slice(0, limit);
    } catch (error) {
      this.logger.error(
        `Failed to generate shortcuts for profile ${profile.id}:`,
        error,
      );
      return this.getDefaultShortcuts(profile.role, limit);
    }
  }

  /**
   * Analyze interaction patterns to identify sequences.
   */
  private analyzeInteractionPatterns(interactions: any[]): any {
    const patterns: Record<string, any> = {
      sequences: [] as Array<{ sequence: string; count: number }>,
      frequentFeatures: {} as Record<string, number>,
      frequentResources: {} as Record<string, number>,
      lastContext: {} as Record<string, any>,
    };

    // Count feature frequencies
    interactions.forEach((log) => {
      if (log.interactionType === 'feature_use' && log.resourceType) {
        patterns.frequentFeatures[log.resourceType] =
          (patterns.frequentFeatures[log.resourceType] || 0) + 1;
      }
      if (log.resourceType) {
        patterns.frequentResources[log.resourceType] =
          (patterns.frequentResources[log.resourceType] || 0) + 1;
      }
    });

    // Find common sequences
    for (let i = 0; i < Math.min(interactions.length - 1, 20); i++) {
      const current = interactions[i].interactionType;
      const next = interactions[i + 1].interactionType;
      const sequence = [current, next].join(' -> ');

      const existing = patterns.sequences.find((s: any) => s.sequence === sequence);
      if (existing) {
        existing.count++;
      } else {
        patterns.sequences.push({ sequence, count: 1 });
      }
    }

    // Sort sequences by frequency
    patterns.sequences.sort((a: any, b: any) => b.count - a.count);

    return patterns;
  }

  /**
   * Generate shortcut suggestions from analyzed patterns.
   */
  private generateSuggestionsFromPatterns(
    patterns: any,
    profile: UserContextProfile,
    limit: number,
  ): any[] {
    const suggestions: any[] = [];

    // From common sequences
    patterns.sequences.slice(0, 3).forEach((seq: any) => {
      const parts = seq.sequence.split(' -> ');
      suggestions.push({
        type: 'common_sequence',
        action: `Proceed to ${parts[1]} after ${parts[0]}`,
        sequence: parts,
        frequency: seq.count,
        relevance: 0.8,
      });
    });

    // From frequently used features
    Object.entries(patterns.frequentFeatures)
      .slice(0, 3)
      .forEach(([feature, count]: [string, any]) => {
        suggestions.push({
          type: 'frequent_feature',
          action: `Quick access to ${feature}`,
          feature,
          frequency: count,
          relevance: 0.7,
        });
      });

    // Role-specific shortcuts
    const roleShortcuts = this.getRoleSpecificShortcuts(profile.role);
    suggestions.push(...roleShortcuts);

    return suggestions;
  }

  /**
   * Get role-specific default shortcuts.
   */
  private getRoleSpecificShortcuts(role: string): any[] {
    const roleShortcuts: Record<string, any[]> = {
      owner: [
        {
          type: 'role_shortcut',
          action: 'View executive dashboard',
          resource: 'dashboard',
          relevance: 0.9,
        },
        {
          type: 'role_shortcut',
          action: 'Review strategic recommendations',
          resource: 'ai_insights',
          relevance: 0.85,
        },
        {
          type: 'role_shortcut',
          action: 'Check organization health',
          resource: 'health_metrics',
          relevance: 0.8,
        },
      ],
      admin: [
        {
          type: 'role_shortcut',
          action: 'View connector status',
          resource: 'connectors',
          relevance: 0.9,
        },
        {
          type: 'role_shortcut',
          action: 'Check system health',
          resource: 'health',
          relevance: 0.85,
        },
        {
          type: 'role_shortcut',
          action: 'View alerts',
          resource: 'alerts',
          relevance: 0.8,
        },
      ],
      manager: [
        {
          type: 'role_shortcut',
          action: 'View team dashboard',
          resource: 'team_dashboard',
          relevance: 0.9,
        },
        {
          type: 'role_shortcut',
          action: 'Check team metrics',
          resource: 'metrics',
          relevance: 0.85,
        },
        {
          type: 'role_shortcut',
          action: 'Review tasks',
          resource: 'tasks',
          relevance: 0.8,
        },
      ],
      member: [
        {
          type: 'role_shortcut',
          action: 'View my tasks',
          resource: 'my_tasks',
          relevance: 0.9,
        },
        {
          type: 'role_shortcut',
          action: 'Check notifications',
          resource: 'notifications',
          relevance: 0.85,
        },
        {
          type: 'role_shortcut',
          action: 'View recent work',
          resource: 'recent',
          relevance: 0.8,
        },
      ],
    };

    return roleShortcuts[role] || [];
  }

  /**
   * Rank shortcuts by relevance score.
   */
  private rankShortcuts(suggestions: any[], profile: UserContextProfile): any[] {
    return suggestions
      .map((shortcut) => {
        let score = shortcut.relevance || 0.5;

        // Boost score if recently used feature
        if (
          profile.frequentlyUsedFeatures &&
          profile.frequentlyUsedFeatures.includes(shortcut.feature)
        ) {
          score += 0.2;
        }

        // Boost score if matches preferred widgets
        if (
          shortcut.type === 'frequent_feature' &&
          profile.preferredDashboardWidgets?.includes(shortcut.feature)
        ) {
          score += 0.15;
        }

        return { ...shortcut, score: Math.min(score, 1) };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get default shortcuts for a role (when no history available).
   */
  private getDefaultShortcuts(role: string, limit: number): any[] {
    const shortcuts = this.getRoleSpecificShortcuts(role);
    return shortcuts.slice(0, limit);
  }

  /**
   * Log shortcut usage.
   * Called when user clicks on a suggested shortcut.
   */
  async logShortcutUsage(
    contextProfileId: string,
    shortcutId: string,
    shortcutAction: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.prisma.interactionLog.create({
        data: {
          contextProfileId,
          organizationId,
          interactionType: 'shortcut_click',
          resourceType: shortcutAction,
          resourceId: shortcutId,
          outcome: 'executed',
        },
      });

      this.logger.log(`Logged shortcut usage: ${shortcutAction}`);
    } catch (error) {
      this.logger.error(
        `Failed to log shortcut usage for profile ${contextProfileId}:`,
        error,
      );
    }
  }

  /**
   * Get next likely action based on current state.
   * Analyzes what user typically does next in this context.
   */
  async getPredictedNextAction(
    profile: UserContextProfile,
    organizationId: string,
    currentContext?: Record<string, any>,
  ): Promise<any> {
    try {
      // Get recent interactions
      const recent = await this.prisma.interactionLog.findMany({
        where: {
          contextProfileId: profile.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      });

      if (recent.length === 0) {
        return null;
      }

      // Get the last interaction type
      const lastType = recent[0].interactionType;

      // Find what typically happens after this type
      const allInteractions = await this.prisma.interactionLog.findMany({
        where: {
          contextProfileId: profile.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      });

      const nextActions: Record<string, number> = {};
      for (let i = 0; i < allInteractions.length - 1; i++) {
        if (allInteractions[i].interactionType === lastType) {
          const nextAction = allInteractions[i + 1].interactionType;
          nextActions[nextAction] = (nextActions[nextAction] || 0) + 1;
        }
      }

      // Get most common next action
      const sorted = Object.entries(nextActions).sort((a, b) => b[1] - a[1]);

      if (sorted.length === 0) {
        return null;
      }

      const [action, count] = sorted[0];
      const probability = count / allInteractions.length;

      return {
        predictedAction: action,
        probability: Math.min(probability, 1),
        confidence: probability > 0.5 ? 'high' : 'medium',
        baselineAction: lastType,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get predicted next action for profile ${profile.id}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get shortcuts optimized for current time of day.
   */
  async getTimeAwareShortcuts(
    profile: UserContextProfile,
    organizationId: string,
    limit = 5,
  ): Promise<any[]> {
    try {
      const hour = new Date().getHours();
      const suggestions = await this.generateShortcuts(
        profile,
        organizationId,
        limit * 2,
      );

      // Adjust based on time of day
      let timeWeighting = 1;
      if (hour >= 9 && hour < 12) {
        // Morning: boost focus/planning related
        timeWeighting = 1.2;
      } else if (hour >= 12 && hour < 14) {
        // Noon: boost review/status related
        timeWeighting = 1.15;
      } else if (hour >= 14 && hour < 17) {
        // Afternoon: boost execution/action related
        timeWeighting = 1.25;
      } else if (hour >= 17 && hour < 19) {
        // Evening: boost summary/reporting related
        timeWeighting = 1.1;
      }

      // Apply weighting and sort
      const adjusted = suggestions
        .map((s) => ({
          ...s,
          timeBoost: timeWeighting,
        }))
        .sort((a, b) => (b.score * b.timeBoost) - (a.score * a.timeBoost));

      return adjusted.slice(0, limit);
    } catch (error) {
      this.logger.error(
        `Failed to get time-aware shortcuts for profile ${profile.id}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get context-aware shortcuts for specific workflow.
   */
  async getWorkflowShortcuts(
    profile: UserContextProfile,
    organizationId: string,
    workflowType: string,
    limit = 5,
  ): Promise<any[]> {
    try {
      // Get shortcuts typically used in this workflow
      const interactions = await this.prisma.interactionLog.findMany({
        where: {
          contextProfileId: profile.id,
          contextData: {
            path: ['workflowType'],
            equals: workflowType,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      });

      if (interactions.length === 0) {
        return this.getDefaultShortcuts(profile.role, limit);
      }

      // Group by action and count
      const actions: Record<string, number> = {};
      interactions.forEach((log) => {
        if (log.resourceType) {
          actions[log.resourceType] = (actions[log.resourceType] || 0) + 1;
        }
      });

      // Generate shortcuts from actions
      const shortcuts = Object.entries(actions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([action, frequency]) => ({
          type: 'workflow_shortcut',
          action: `${action} in ${workflowType}`,
          resource: action,
          frequency,
          relevance: Math.min(frequency / 10, 1),
        }));

      return shortcuts;
    } catch (error) {
      this.logger.error(
        `Failed to get workflow shortcuts for profile ${profile.id}:`,
        error,
      );
      return this.getDefaultShortcuts(profile.role, limit);
    }
  }
}
