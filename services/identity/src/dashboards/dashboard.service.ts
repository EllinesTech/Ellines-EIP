import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Dashboard, Widget, Alert, DashboardExport, Prisma } from '@prisma/client';
import {
  PredictiveAnalyticsService,
  ForecastResult,
} from '../analytics/predictive-analytics.service';

/** Enriched widget shape returned by getWidgetWithForecast. */
export interface WidgetWithForecast extends Widget {
  forecastData?: ForecastResult | null;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private prisma: PrismaService,
    private predictiveAnalytics: PredictiveAnalyticsService,
  ) {}

  /**
   * List all dashboards for an organization
   */
  async listDashboards(organizationId: string): Promise<Dashboard[]> {
    return this.prisma.dashboard.findMany({
      where: { organizationId },
      include: {
        widgets: { orderBy: { position: 'asc' } },
        exports: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single dashboard by ID
   */
  async getDashboard(id: string, organizationId: string): Promise<Dashboard> {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id, organizationId },
      include: {
        widgets: { include: { alerts: true }, orderBy: { position: 'asc' } },
        exports: true,
      },
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard ${id} not found`);
    }

    return dashboard;
  }

  /**
   * Create a new dashboard
   */
  async createDashboard(
    organizationId: string,
    input: {
      name: string;
      description?: string;
      layout?: Record<string, any>[];
      refreshRate?: number;
      isPublic?: boolean;
    },
    createdBy: string,
  ): Promise<Dashboard> {
    return this.prisma.dashboard.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description || '',
        layout: input.layout || [],
        refreshRate: input.refreshRate || 300,
        isPublic: input.isPublic || false,
        createdBy,
      },
    });
  }

  /**
   * Update a dashboard
   */
  async updateDashboard(
    id: string,
    organizationId: string,
    input: Partial<Omit<Dashboard, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Dashboard> {
    return this.prisma.dashboard.update({
      where: { id },
      data: input as any,
    });
  }

  /**
   * Delete a dashboard
   */
  async deleteDashboard(id: string, organizationId: string): Promise<void> {
    await this.prisma.dashboard.deleteMany({
      where: { id, organizationId },
    });
  }

  /**
   * Add a widget to a dashboard
   */
  async addWidget(
    dashboardId: string,
    organizationId: string,
    input: {
      type: string;
      title: string;
      config?: Record<string, any>;
      position?: number;
      size?: Record<string, any>;
      dataSourceId?: string;
    },
  ): Promise<Widget> {
    // Verify dashboard exists and belongs to org
    await this.getDashboard(dashboardId, organizationId);

    // Get next position if not provided
    const position = input.position ?? 0;

    return this.prisma.widget.create({
      data: {
        dashboardId,
        type: input.type,
        title: input.title,
        config: input.config || {},
        position,
        size: input.size || { w: 2, h: 2 },
        dataSourceId: input.dataSourceId,
      },
    });
  }

  /**
   * Update a widget
   */
  async updateWidget(
    widgetId: string,
    dashboardId: string,
    organizationId: string,
    input: Partial<Omit<Widget, 'id' | 'dashboardId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Widget> {
    // Verify dashboard access
    await this.getDashboard(dashboardId, organizationId);

    return this.prisma.widget.update({
      where: { id: widgetId },
      data: input as any,
    });
  }

  /**
   * Delete a widget
   */
  async deleteWidget(
    widgetId: string,
    dashboardId: string,
    organizationId: string,
  ): Promise<void> {
    await this.getDashboard(dashboardId, organizationId);

    await this.prisma.widget.delete({
      where: { id: widgetId },
    });
  }

  /**
   * Add an alert to a widget
   */
  async addAlert(
    widgetId: string,
    dashboardId: string,
    organizationId: string,
    input: {
      condition: string;
      threshold: number;
      actions?: Record<string, any>[];
      active?: boolean;
    },
  ): Promise<Alert> {
    // Verify dashboard and widget exist
    await this.getDashboard(dashboardId, organizationId);

    return this.prisma.alert.create({
      data: {
        widgetId,
        condition: input.condition,
        threshold: input.threshold,
        actions: input.actions || [],
        active: input.active ?? true,
      },
    });
  }

  /**
   * Update an alert
   */
  async updateAlert(
    alertId: string,
    dashboardId: string,
    organizationId: string,
    input: Partial<Omit<Alert, 'id' | 'widgetId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Alert> {
    // Verify dashboard access
    await this.getDashboard(dashboardId, organizationId);

    return this.prisma.alert.update({
      where: { id: alertId },
      data: input as any,
    });
  }

  /**
   * Delete an alert
   */
  async deleteAlert(
    alertId: string,
    dashboardId: string,
    organizationId: string,
  ): Promise<void> {
    await this.getDashboard(dashboardId, organizationId);

    await this.prisma.alert.delete({
      where: { id: alertId },
    });
  }

  /**
   * Export a dashboard to PDF or CSV
   */
  async exportDashboard(
    dashboardId: string,
    organizationId: string,
    format: 'pdf' | 'csv' | 'excel',
    schedule?: string,
  ): Promise<DashboardExport> {
    // Verify dashboard exists
    await this.getDashboard(dashboardId, organizationId);

    return this.prisma.dashboardExport.create({
      data: {
        dashboardId,
        format,
        schedule: schedule || null,
        lastRun: new Date(),
        nextRun: schedule ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
      },
    });
  }

  /**
   * Get export schedules for a dashboard
   */
  async getExports(dashboardId: string, organizationId: string): Promise<DashboardExport[]> {
    await this.getDashboard(dashboardId, organizationId);

    return this.prisma.dashboardExport.findMany({
      where: { dashboardId },
    });
  }

  /**
   * Save a named version snapshot of the current dashboard layout.
   * Versions are stored in Dashboard.layout as a versioned array suffix.
   *
   * Requirement 20.3: Dashboard versioning
   */
  async saveVersion(
    dashboardId: string,
    organizationId: string,
    label?: string,
  ): Promise<{ versionId: string; label: string; savedAt: Date }> {
    const dashboard = await this.getDashboard(dashboardId, organizationId);

    const versionId = crypto.randomUUID();
    const savedAt = new Date();
    const versionLabel = label || `v${savedAt.toISOString().slice(0, 10)}`;

    // Append version metadata to dashboard.layout (stored as a special entry)
    const currentLayout = Array.isArray(dashboard.layout) ? dashboard.layout : [];
    const versionEntry = {
      __version: true,
      versionId,
      label: versionLabel,
      savedAt: savedAt.toISOString(),
      snapshot: currentLayout.filter((l: any) => !l.__version),
    };

    // Retain up to 10 versions (oldest dropped first)
    const versions = currentLayout.filter((l: any) => l.__version === true);
    const kept = versions.slice(-9); // keep last 9, plus new = 10

    const updatedLayout = [
      ...currentLayout.filter((l: any) => !l.__version),
      ...kept,
      versionEntry,
    ];

    await this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: { layout: updatedLayout as any },
    });

    this.logger.log(`Saved dashboard version '${versionLabel}' for ${dashboardId}`);

    return { versionId, label: versionLabel, savedAt };
  }

  /**
   * List saved versions for a dashboard.
   *
   * Requirement 20.3: Dashboard version history
   */
  async listVersions(
    dashboardId: string,
    organizationId: string,
  ): Promise<{ versionId: string; label: string; savedAt: string }[]> {
    const dashboard = await this.getDashboard(dashboardId, organizationId);
    const layout = Array.isArray(dashboard.layout) ? dashboard.layout : [];

    return layout
      .filter((l: any) => l.__version === true)
      .map((v: any) => ({
        versionId: v.versionId,
        label: v.label,
        savedAt: v.savedAt,
      }))
      .reverse(); // Most recent first
  }

  /**
   * Restore a specific version of a dashboard layout.
   *
   * Requirement 20.3: Dashboard version restore
   */
  async restoreVersion(
    dashboardId: string,
    organizationId: string,
    versionId: string,
  ): Promise<{ restored: boolean }> {
    const dashboard = await this.getDashboard(dashboardId, organizationId);
    const layout = Array.isArray(dashboard.layout) ? dashboard.layout : [];

    const version = layout.find((l: any) => l.__version === true && l.versionId === versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    const restoredLayout = [
      ...((version as Record<string, unknown>).snapshot as unknown[] ?? []),
      ...layout.filter((l: any) => l.__version === true), // keep all versions
    ];

    await this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: { layout: restoredLayout as any },
    });

    this.logger.log(`Restored version ${versionId} for dashboard ${dashboardId}`);
    return { restored: true };
  }

  /**
   * Save a snapshot of the dashboard config.
   * Appends the config to the versioned history stored in `Dashboard.layout`
   * (the only JSON field on Dashboard). Keeps the last 20 snapshots.
   *
   * Satisfies the Task 18.3 spec interface: `(dashboardId, orgId, config) → void`.
   * Requirement 20.3: Dashboard versioning (saveDashboardVersion spec interface)
   */
  async saveDashboardVersion(
    dashboardId: string,
    orgId: string,
    config: unknown,
  ): Promise<void> {
    const dashboard = await this.getDashboard(dashboardId, orgId);

    const currentLayout = Array.isArray(dashboard.layout) ? dashboard.layout : [];

    const historyEntry = {
      __history: true,
      savedAt: new Date().toISOString(),
      config,
    };

    const nonHistory = currentLayout.filter((l: any) => !l.__history && !l.__version);
    const existingVersions = currentLayout.filter((l: any) => l.__version === true);
    const existingHistory = currentLayout.filter((l: any) => l.__history === true);

    // Keep last 19 history entries + new one = 20 max
    const keptHistory = [...existingHistory, historyEntry].slice(-20);

    await this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        layout: [...nonHistory, ...existingVersions, ...keptHistory] as any,
      },
    });

    this.logger.log(
      `saveDashboardVersion: appended config snapshot for dashboard=${dashboardId} org=${orgId}`,
    );
  }

  /**
   * Delete an export schedule
   */
  async deleteExport(
    exportId: string,
    dashboardId: string,
    organizationId: string,
  ): Promise<void> {
    await this.getDashboard(dashboardId, organizationId);

    await this.prisma.dashboardExport.delete({
      where: { id: exportId },
    });
  }

  /**
   * Invalidate widget cache for all dashboards in the org by touching their
   * updatedAt timestamp.  Uses a single updateMany call per Requirement 7.8.
   *
   * Requirement 7.8, 20.4: Cache invalidation and real-time push
   */
  async invalidateWidgetCache(orgId: string): Promise<void> {
    await this.prisma.dashboard.updateMany({
      where: { organizationId: orgId },
      data: { updatedAt: new Date() },
    });

    this.logger.log(`invalidateWidgetCache: touched updatedAt for all dashboards in org=${orgId}`);
  }

  /**
   * Get a dashboard with forecast data embedded into any forecast widgets.
   *
   * When a widget has `type === 'forecast'` (or the `config.widgetType` field
   * equals `'forecast'`), this method calls PredictiveAnalyticsService.forecast()
   * and attaches the result as `forecastData` on the widget object.
   *
   * The metric is resolved from `widget.config.metric` with a fallback to
   * `'health_score'`.  The horizon defaults to 30 days.
   *
   * Non-forecast widgets are returned unchanged.  InfluxDB failures are
   * isolated per widget — a failure on one widget does not prevent the rest
   * from being returned.
   *
   * @param dashboardId    Dashboard to load.
   * @param organizationId Mandatory tenant scope — applied to both the DB
   *                       query and every InfluxDB call (Security Rule §6).
   */
  async getDashboardWithForecast(
    dashboardId: string,
    organizationId: string,
  ): Promise<{ dashboard: Dashboard; widgets: WidgetWithForecast[] }> {
    const dashboard = await this.getDashboard(dashboardId, organizationId);

    const rawWidgets: Widget[] = (dashboard as Dashboard & { widgets?: Widget[] }).widgets ?? [];

    const widgets: WidgetWithForecast[] = await Promise.all(
      rawWidgets.map(async (widget) => {
        const config = (widget.config ?? {}) as Record<string, unknown>;

        const isForecastWidget =
          widget.type === 'forecast' ||
          config['widgetType'] === 'forecast';

        if (!isForecastWidget) {
          return widget as WidgetWithForecast;
        }

        const metric =
          typeof config['metric'] === 'string' && config['metric']
            ? config['metric']
            : 'health_score';

        const horizonRaw = config['horizon'];
        const horizon =
          typeof horizonRaw === 'number' && horizonRaw > 0
            ? horizonRaw
            : 30;

        let forecastData: ForecastResult | null = null;
        try {
          forecastData = await this.predictiveAnalytics.forecast(
            organizationId,
            metric,
            horizon,
          );
        } catch (err) {
          this.logger.warn(
            `getDashboardWithForecast: forecast failed for widget=${widget.id} ` +
              `metric=${metric}: ${(err as Error).message}`,
          );
        }

        return { ...widget, forecastData } as WidgetWithForecast;
      }),
    );

    return { dashboard, widgets };
  }
}
