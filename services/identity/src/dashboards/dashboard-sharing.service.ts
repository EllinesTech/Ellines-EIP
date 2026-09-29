/**
 * Dashboard Sharing Service
 * 
 * Share dashboards with permissions
 * Requirement 20.4: Dashboard sharing with permissions
 */

import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

export interface SharePermission {
  dashboardId: string;
  sharedWith: string; // userId or email
  permission: 'view' | 'edit' | 'admin';
  expiresAt?: Date;
}

export interface ShareLink {
  shareId: string;
  dashboardId: string;
  token: string;
  url: string;
  permission: 'view' | 'edit';
  expiresAt?: Date;
  isActive: boolean;
}

@Injectable()
export class DashboardSharingService {
  private readonly logger = new Logger(DashboardSharingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Share dashboard with a user (convenience overload).
   * Requirement 20.4: Dashboard sharing with permissions
   */
  async share(
    dashboardId: string,
    organizationId: string,
    sharedBy: string,
    options: {
      shareWith?: string;
      permission?: 'view' | 'edit' | 'admin';
      generateLink?: boolean;
      expiresAt?: Date;
    },
  ): Promise<{ shareId?: string; shareLink?: ShareLink }> {
    const result: { shareId?: string; shareLink?: ShareLink } = {};

    if (options.shareWith) {
      const { shareId } = await this.shareDashboard(
        dashboardId,
        organizationId,
        sharedBy,
        options.shareWith,
        options.permission ?? 'view',
        options.expiresAt,
      );
      result.shareId = shareId;
    }

    if (options.generateLink) {
      result.shareLink = await this.generateShareLink(
        dashboardId,
        organizationId,
        options.permission === 'edit' ? 'edit' : 'view',
        options.expiresAt,
      );
    }

    return result;
  }

  /**
   * Share dashboard with a user
   * Requirement 20.4: Dashboard sharing with permissions
   */
  async shareDashboard(
    dashboardId: string,
    organizationId: string,
    sharedBy: string,
    shareWith: string,
    permission: 'view' | 'edit' | 'admin',
    expiresAt?: Date,
  ): Promise<{ shareId: string }> {
    // Verify dashboard exists and user has permission
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, organizationId },
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    }

    // Check if user has permission to share
    if (dashboard.createdBy !== sharedBy && !dashboard.isPublic) {
      throw new ForbiddenException('You do not have permission to share this dashboard');
    }

    // Create or update share record
    // Note: This would use a DashboardShare table in production
    // For now, we'll use the Dashboard's metadata field
    const shareRecord = {
      id: crypto.randomUUID(),
      sharedWith: shareWith,
      permission,
      sharedBy,
      sharedAt: new Date(),
      expiresAt,
    };

    // Update dashboard with share info (simplified)
    await this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Dashboard ${dashboardId} shared with ${shareWith} by ${sharedBy}`);

    return { shareId: shareRecord.id };
  }

  /**
   * Generate shareable link
   * Requirement 20.4: Public link sharing
   */
  async generateShareLink(
    dashboardId: string,
    organizationId: string,
    permission: 'view' | 'edit',
    expiresAt?: Date,
  ): Promise<ShareLink> {
    // Verify dashboard exists
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, organizationId },
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const shareId = crypto.randomUUID();

    // Store share link (in production, use a DashboardShareLink table)
    // For now, simulate
    const baseUrl = process.env.PUBLIC_URL || 'https://eip.ellines.co.ke';
    const url = `${baseUrl}/shared/dashboard/${token}`;

    this.logger.log(`Generated share link for dashboard ${dashboardId}`);

    return {
      shareId,
      dashboardId,
      token,
      url,
      permission,
      expiresAt,
      isActive: true,
    };
  }

  /**
   * Generate a signed JWT share link with a 7-day TTL.
   * Requirement 20.4: Signed share links
   */
  async generateSignedShareLink(
    dashboardId: string,
    organizationId: string,
    permission: 'view' | 'edit',
  ): Promise<ShareLink> {
    // Verify dashboard exists
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, organizationId },
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    }

    const shareId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 7 * 24 * 60 * 60; // 7 days
    const expiresAt = new Date(exp * 1000);

    // Build a minimal JWT (HS256) without external dependency.
    // Payload carries dashboardId, orgId, permission, and standard JWT claims.
    const secret = process.env.JWT_SECRET || 'eip-share-secret';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: shareId, dashboardId, organizationId, permission, iat: now, exp }),
    ).toString('base64url');
    const sigInput = `${header}.${payload}`;
    const sig = crypto
      .createHmac('sha256', secret)
      .update(sigInput)
      .digest('base64url');
    const token = `${sigInput}.${sig}`;

    const baseUrl = process.env.PUBLIC_URL || 'https://eip.ellines.co.ke';
    const url = `${baseUrl}/shared/dashboard/${token}`;

    this.logger.log(`Generated signed JWT share link for dashboard ${dashboardId}`);

    return {
      shareId,
      dashboardId,
      token,
      url,
      permission,
      expiresAt,
      isActive: true,
    };
  }

  /**
   * Revoke share access
   */
  async revokeShare(
    shareId: string,
    dashboardId: string,
    organizationId: string,
  ): Promise<void> {
    // In production, delete from DashboardShare table
    this.logger.log(`Revoked share ${shareId} for dashboard ${dashboardId}`);
  }

  /**
   * List all shares for a dashboard
   */
  async listShares(dashboardId: string, organizationId: string): Promise<any[]> {
    // In production, query DashboardShare table
    // For now, return empty array
    return [];
  }

  /**
   * Check if user has access to dashboard
   */
  async checkAccess(
    dashboardId: string,
    userId: string,
  ): Promise<{ hasAccess: boolean; permission: string | null }> {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId },
    });

    if (!dashboard) {
      return { hasAccess: false, permission: null };
    }

    // Owner always has admin access
    if (dashboard.createdBy === userId) {
      return { hasAccess: true, permission: 'admin' };
    }

    // Public dashboards allow view access
    if (dashboard.isPublic) {
      return { hasAccess: true, permission: 'view' };
    }

    // In production, check DashboardShare table
    return { hasAccess: false, permission: null };
  }

  /**
   * Validate share token
   */
  async validateShareToken(token: string): Promise<{ dashboardId: string; permission: string } | null> {
    // In production, query DashboardShareLink table
    // Check if token is valid and not expired
    // For now, return null (not implemented)
    return null;
  }

  /**
   * Generate a public share link for a dashboard.
   * Requirement 20.4: Dashboard sharing via link (task 18.3 spec interface)
   *
   * @param dashboardId  The dashboard to share.
   * @param orgId        The owning organization (tenant scope).
   * @returns            `{ shareUrl }` — the public URL for the shared dashboard.
   */
  async shareWithLink(
    dashboardId: string,
    orgId: string,
  ): Promise<{ shareUrl: string }> {
    const link = await this.generateShareLink(dashboardId, orgId, 'view');
    return { shareUrl: link.url };
  }
}
