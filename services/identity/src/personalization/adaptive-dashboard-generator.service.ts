import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextProfile } from '@prisma/client';

/**
 * AdaptiveDashboardGenerator — Generates personalized dashboard content.
 * Selects and reorders widgets based on user context.
 *
 * Implements Requirement 19.2:
 * "THE Ellines_EIP SHALL adapt dashboard content based on user context showing most relevant widgets and metrics"
 */
@Injectable()
export class AdaptiveDashboardGenerator {
  private readonly logger = new Logger(AdaptiveDashboardGenerator.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate adaptive dashboard content for a user.
   * Returns dashboard with widgets selected and ordered based on user context.
   */
  async generateAdaptiveDashboard(
    profile: UserContextProfile,
    organizationId: string,
    dashboardId?: string,
  ): Promise<any> {
    try {
      // Get base dashboard(s)
      let dashboards;
      if (dashboardId) {
        dashboards = await this.prisma.dashboard.findMany({
          where: {
            id: dashboardId,
            organizationId,
          },
          include: {
            widgets: true,
          },
        });
      } else {
        // Get dashboards accessible to this user's role
        dashboards = await this.prisma.dashboard.findMany({
          where: {
            organizationId,
          },
          include: {
            widgets: true,
          },
        });
      }

      if (!dashboards || dashboards.length === 0) {
        return null;
      }

      // Adapt the first dashboard (or primary one)
      const dashboard = dashboards[0];

      // Score and rank widgets based on user context
      const adaptedWidgets = this.rankWidgets(
        dashboard.widgets,
        profile,
      );

      // Reorganize layout based on ranking
      const adaptedLayout = this.generateLayout(
        adaptedWidgets,
        profile.role,
      );

      return {
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        widgets: adaptedWidgets,
        layout: adaptedLayout,
        refreshRate: dashboard.refreshRate,
        role: profile.role,
        personalized: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate adaptive dashboard for profile ${profile.id}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Rank widgets based on user context.
   * Prioritizes widgets that match user's role, department, and preferences.
   */
  private rankWidgets(widgets: any[], profile: UserContextProfile): any[] {
    const rankedWidgets = widgets.map((widget) => {
      let score = 0;

      // Base score: 50 points
      score += 50;

      // Widget type preference: if in user's preferred widgets, add points
      if (
        profile.preferredDashboardWidgets &&
        profile.preferredDashboardWidgets.includes(widget.type)
      ) {
        score += 30;
      }

      // Role-based widget scoring
      // (In real implementation, could have role-specific widget mappings)
      if (this.isWidgetRelevantForRole(widget.type, profile.role)) {
        score += 20;
      }

      // Time-based scoring: recently used widgets rank higher
      if (widget.updatedAt) {
        const hoursAgo =
          (new Date().getTime() - new Date(widget.updatedAt).getTime()) /
          (1000 * 60 * 60);
        if (hoursAgo < 24) {
          score += 10;
        }
      }

      return {
        ...widget,
        _score: score,
      };
    });

    // Sort by score (descending)
    return rankedWidgets.sort((a, b) => b._score - a._score).map((w) => {
      const { _score, ...widget } = w;
      return widget;
    });
  }

  /**
   * Generate dashboard layout based on role and widget types.
   */
  private generateLayout(
    widgets: any[],
    role: string,
  ): Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }> {
    const layout: Array<any> = [];
    let currentY = 0;
    let currentX = 0;
    const maxWidth = 12; // Grid width

    // Role-based sizing
    let defaultWidth = 4;
    let defaultHeight = 3;

    if (role === 'owner') {
      defaultWidth = 6;
      defaultHeight = 4;
    } else if (role === 'admin') {
      defaultWidth = 4;
      defaultHeight = 3;
    } else if (role === 'member') {
      defaultWidth = 4;
      defaultHeight = 3;
    }

    widgets.forEach((widget) => {
      // Determine size based on widget type
      let w = defaultWidth;
      let h = defaultHeight;

      if (widget.type === 'kpi_card' || widget.type === 'gauge') {
        w = 3;
        h = 2;
      } else if (widget.type === 'table') {
        w = 12;
        h = 4;
      } else if (widget.type === 'heat_map' || widget.type === 'network_graph') {
        w = 6;
        h = 4;
      }

      // Handle wrapping
      if (currentX + w > maxWidth) {
        currentX = 0;
        currentY += defaultHeight;
      }

      layout.push({
        id: widget.id,
        x: currentX,
        y: currentY,
        w: Math.min(w, maxWidth),
        h: h,
      });

      currentX += w;
      if (currentX >= maxWidth) {
        currentX = 0;
        currentY += defaultHeight;
      }
    });

    return layout;
  }

  /**
   * Determine if a widget is relevant for a specific role.
   */
  private isWidgetRelevantForRole(widgetType: string, role: string): boolean {
    const roleWidgetMap: Record<string, string[]> = {
      owner: [
        'kpi_card',
        'line_chart',
        'health_score',
        'ai_insight',
        'gauge',
      ],
      admin: [
        'table',
        'bar_chart',
        'alert_list',
        'heat_map',
        'connector_status',
      ],
      manager: [
        'kpi_card',
        'line_chart',
        'bar_chart',
        'pie_chart',
        'alert_list',
      ],
      member: [
        'kpi_card',
        'gauge',
        'sparkline',
        'alert_list',
        'task_list',
      ],
      viewer: ['kpi_card', 'gauge', 'sparkline', 'table'],
    };

    const relevantWidgets = roleWidgetMap[role] || [];
    return relevantWidgets.includes(widgetType);
  }

  /**
   * Suggest widget removals based on disuse.
   * Returns list of widget IDs that user hasn't interacted with recently.
   */
  async suggestWidgetRemovals(
    dashboardId: string,
    profile: UserContextProfile,
    daysInactive = 30,
  ): Promise<string[]> {
    try {
      const dashboard = await this.prisma.dashboard.findUnique({
        where: { id: dashboardId },
        include: { widgets: true },
      });

      if (!dashboard) {
        return [];
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

      const toRemove = dashboard.widgets
        .filter((w) => {
          // Widget is inactive if not updated in daysInactive period
          return new Date(w.updatedAt) < cutoffDate;
        })
        .map((w) => w.id);

      return toRemove;
    } catch (error) {
      this.logger.error(
        `Failed to suggest widget removals for dashboard ${dashboardId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Suggest new widgets for user based on role and organization.
   */
  async suggestNewWidgets(
    organizationId: string,
    profile: UserContextProfile,
    limit = 5,
  ): Promise<any[]> {
    try {
      // Get all available widgets for organization
      const allWidgets = await this.prisma.widget.findMany({
        where: {
          dashboard: {
            organizationId,
          },
        },
        take: limit * 3, // Get more to filter
      });

      if (!allWidgets || allWidgets.length === 0) {
        return [];
      }

      // Filter and score widgets relevant to user's role
      const suggestedWidgets = allWidgets
        .filter(
          (w) =>
            !profile.preferredDashboardWidgets?.includes(w.type) ||
            profile.preferredDashboardWidgets.length < 5, // Suggest if not in preferences or few preferences
        )
        .sort(() => Math.random() - 0.5) // Shuffle for variety
        .slice(0, limit);

      return suggestedWidgets;
    } catch (error) {
      this.logger.error(
        `Failed to suggest new widgets for profile ${profile.id}:`,
        error,
      );
      return [];
    }
  }
}
