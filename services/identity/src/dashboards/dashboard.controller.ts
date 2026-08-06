import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboards')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboards?orgId=:organizationId
   * List all dashboards for an organization
   */
  @Get()
  async listDashboards(@Body() body: { organizationId: string }) {
    return this.dashboardService.listDashboards(body.organizationId);
  }

  /**
   * POST /api/v1/dashboards
   * Create a new dashboard
   */
  @Post()
  async createDashboard(
    @Body()
    input: {
      organizationId: string;
      name: string;
      description?: string;
      layout?: Record<string, any>[];
      refreshRate?: number;
      isPublic?: boolean;
      createdBy: string;
    },
  ) {
    return this.dashboardService.createDashboard(
      input.organizationId,
      input,
      input.createdBy,
    );
  }

  /**
   * GET /api/v1/dashboards/:id
   * Get a single dashboard
   */
  @Get(':id')
  async getDashboard(
    @Param('id') id: string,
    @Body() body: { organizationId: string },
  ) {
    return this.dashboardService.getDashboard(id, body.organizationId);
  }

  /**
   * PATCH /api/v1/dashboards/:id
   * Update a dashboard
   */
  @Patch(':id')
  async updateDashboard(
    @Param('id') id: string,
    @Body()
    input: {
      organizationId: string;
      name?: string;
      description?: string;
      layout?: Record<string, any>[];
      refreshRate?: number;
      isPublic?: boolean;
    },
  ) {
    return this.dashboardService.updateDashboard(id, input.organizationId, input);
  }

  /**
   * DELETE /api/v1/dashboards/:id
   * Delete a dashboard
   */
  @Delete(':id')
  async deleteDashboard(
    @Param('id') id: string,
    @Body() body: { organizationId: string },
  ) {
    await this.dashboardService.deleteDashboard(id, body.organizationId);
    return { ok: true };
  }

  /**
   * POST /api/v1/dashboards/:id/widgets
   * Add a widget to a dashboard
   */
  @Post(':id/widgets')
  async addWidget(
    @Param('id') dashboardId: string,
    @Body()
    input: {
      organizationId: string;
      type: string;
      title: string;
      config?: Record<string, any>;
      position?: number;
      size?: Record<string, any>;
      dataSourceId?: string;
    },
  ) {
    return this.dashboardService.addWidget(dashboardId, input.organizationId, input);
  }

  /**
   * PATCH /api/v1/dashboards/:dashboardId/widgets/:widgetId
   * Update a widget
   */
  @Patch(':dashboardId/widgets/:widgetId')
  async updateWidget(
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body()
    input: {
      organizationId: string;
      type?: string;
      title?: string;
      config?: Record<string, any>;
      position?: number;
      size?: Record<string, any>;
    },
  ) {
    return this.dashboardService.updateWidget(
      widgetId,
      dashboardId,
      input.organizationId,
      input,
    );
  }

  /**
   * DELETE /api/v1/dashboards/:dashboardId/widgets/:widgetId
   * Delete a widget
   */
  @Delete(':dashboardId/widgets/:widgetId')
  async deleteWidget(
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body() body: { organizationId: string },
  ) {
    await this.dashboardService.deleteWidget(widgetId, dashboardId, body.organizationId);
    return { ok: true };
  }

  /**
   * POST /api/v1/dashboards/:dashboardId/alerts
   * Add an alert to a widget
   */
  @Post(':dashboardId/alerts')
  async addAlert(
    @Param('dashboardId') dashboardId: string,
    @Body()
    input: {
      organizationId: string;
      widgetId: string;
      condition: string;
      threshold: number;
      actions?: Record<string, any>[];
      active?: boolean;
    },
  ) {
    return this.dashboardService.addAlert(
      input.widgetId,
      dashboardId,
      input.organizationId,
      input,
    );
  }

  /**
   * PATCH /api/v1/dashboards/:dashboardId/alerts/:alertId
   * Update an alert
   */
  @Patch(':dashboardId/alerts/:alertId')
  async updateAlert(
    @Param('dashboardId') dashboardId: string,
    @Param('alertId') alertId: string,
    @Body()
    input: {
      organizationId: string;
      condition?: string;
      threshold?: number;
      actions?: Record<string, any>[];
      active?: boolean;
    },
  ) {
    return this.dashboardService.updateAlert(alertId, dashboardId, input.organizationId, input);
  }

  /**
   * DELETE /api/v1/dashboards/:dashboardId/alerts/:alertId
   * Delete an alert
   */
  @Delete(':dashboardId/alerts/:alertId')
  async deleteAlert(
    @Param('dashboardId') dashboardId: string,
    @Param('alertId') alertId: string,
    @Body() body: { organizationId: string },
  ) {
    await this.dashboardService.deleteAlert(alertId, dashboardId, body.organizationId);
    return { ok: true };
  }

  /**
   * POST /api/v1/dashboards/:id/export
   * Export a dashboard
   */
  @Post(':id/export')
  async exportDashboard(
    @Param('id') dashboardId: string,
    @Body()
    input: {
      organizationId: string;
      format: 'pdf' | 'csv' | 'excel';
      schedule?: string;
    },
  ) {
    return this.dashboardService.exportDashboard(
      dashboardId,
      input.organizationId,
      input.format,
      input.schedule,
    );
  }

  /**
   * GET /api/v1/dashboards/:id/exports
   * Get export schedules for a dashboard
   */
  @Get(':id/exports')
  async getExports(
    @Param('id') dashboardId: string,
    @Body() body: { organizationId: string },
  ) {
    return this.dashboardService.getExports(dashboardId, body.organizationId);
  }

  /**
   * DELETE /api/v1/dashboards/:dashboardId/exports/:exportId
   * Delete an export schedule
   */
  @Delete(':dashboardId/exports/:exportId')
  async deleteExport(
    @Param('dashboardId') dashboardId: string,
    @Param('exportId') exportId: string,
    @Body() body: { organizationId: string },
  ) {
    await this.dashboardService.deleteExport(exportId, dashboardId, body.organizationId);
    return { ok: true };
  }
}
