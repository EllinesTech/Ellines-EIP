import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Dashboard, Widget, Alert, DashboardExport, Prisma } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

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
      data: input,
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
      data: input,
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
      data: input,
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
}
