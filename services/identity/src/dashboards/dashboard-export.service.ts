/**
 * Dashboard Export Service
 * 
 * Export dashboards to PDF, PNG formats
 * Requirement 20.3: Dashboard export functionality
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DashboardExportRequest {
  dashboardId: string;
  organizationId: string;
  format: 'pdf' | 'png';
  includeWidgets?: string[]; // Widget IDs to include (all if not specified)
}

export interface DashboardExportResult {
  exportId: string;
  format: string;
  url: string; // Download URL
  expiresAt: Date;
  sizeBytes: number;
}

@Injectable()
export class DashboardExportService {
  private readonly logger = new Logger(DashboardExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export dashboard to PDF or PNG
   * Requirement 20.3: Export functionality (PDF, PNG)
   */
  async exportDashboard(request: DashboardExportRequest): Promise<DashboardExportResult> {
    const { dashboardId, organizationId, format } = request;

    // Verify dashboard exists and user has access
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, organizationId },
      include: { widgets: true },
    });

    if (!dashboard) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }

    // Generate export
    let exportData: Buffer;
    if (format === 'pdf') {
      exportData = await this.generatePDF(dashboard);
    } else {
      exportData = await this.generatePNG(dashboard);
    }

    // Store export metadata
    const exportRecord = await this.prisma.dashboardExport.create({
      data: {
        dashboardId,
        format,
        schedule: null, // Manual export
        lastExportedAt: new Date(),
      },
    });

    // In production, upload to S3/CloudFlare R2
    // For now, simulate a URL
    const url = `/api/v1/dashboards/${dashboardId}/exports/${exportRecord.id}/download`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    this.logger.log(`Exported dashboard ${dashboardId} as ${format}`);

    return {
      exportId: exportRecord.id,
      format,
      url,
      expiresAt,
      sizeBytes: exportData.length,
    };
  }

  /**
   * Generate PDF export
   */
  private async generatePDF(dashboard: any): Promise<Buffer> {
    // In production, use a library like puppeteer or pdfkit
    // For now, return a mock PDF
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
100 700 Td
(Dashboard: ${dashboard.name}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000315 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
407
%%EOF`;

    return Buffer.from(pdfContent);
  }

  /**
   * Generate PNG export
   */
  private async generatePNG(dashboard: any): Promise<Buffer> {
    // In production, use puppeteer or a canvas library
    // For now, return a 1x1 transparent PNG
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
      0x0d, 0x0a, 0x2d, 0xb4,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
      0xae, 0x42, 0x60, 0x82,
    ]);

    return pngData;
  }

  /**
   * Schedule recurring export
   * Requirement 20.3: Export scheduling
   */
  async scheduleExport(
    dashboardId: string,
    organizationId: string,
    format: 'pdf' | 'png',
    schedule: string, // cron expression
  ): Promise<{ exportId: string }> {
    const exportRecord = await this.prisma.dashboardExport.create({
      data: {
        dashboardId,
        format,
        schedule,
        lastExportedAt: null,
      },
    });

    this.logger.log(`Scheduled ${format} export for dashboard ${dashboardId}: ${schedule}`);

    return { exportId: exportRecord.id };
  }

  /**
   * Cancel scheduled export
   */
  async cancelScheduledExport(exportId: string): Promise<void> {
    await this.prisma.dashboardExport.delete({
      where: { id: exportId },
    });

    this.logger.log(`Cancelled scheduled export ${exportId}`);
  }

  /**
   * List all exports for a dashboard
   */
  async listExports(dashboardId: string): Promise<any[]> {
    return this.prisma.dashboardExport.findMany({
      where: { dashboardId },
      orderBy: { lastExportedAt: 'desc' },
    });
  }
}
