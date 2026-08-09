/**
 * Dashboard WebSocket Gateway
 *
 * Real-time dashboard updates via WebSocket
 * Requirement 7.8, 20.4: Sub-second WebSocket update latency
 *
 * Note: Requires @nestjs/websockets, @nestjs/platform-socket.io, socket.io
 * to be installed at runtime. Types declared inline to avoid compile-time dependency.
 */

import { Injectable, Logger } from '@nestjs/common';

interface DashboardSubscription {
  socketId: string;
  dashboardId: string;
  organizationId: string;
}

/**
 * Dashboard WebSocket Gateway
 *
 * When @nestjs/websockets and socket.io are available, this can be decorated with
 * @WebSocketGateway({ cors: true, namespace: '/dashboards' })
 * For now it exposes the broadcast methods used by DashboardService.
 */
@Injectable()
export class DashboardWebSocketGateway {
  private readonly logger = new Logger(DashboardWebSocketGateway.name);
  private subscriptions: Map<string, DashboardSubscription[]> = new Map();

  // Will be set by bootstrap when socket.io server is available
  private server: any = null;

  setServer(server: any): void {
    this.server = server;
  }

  handleConnection(client: any): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: any): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.subscriptions.forEach((subs, dashboardId) => {
      this.subscriptions.set(
        dashboardId,
        subs.filter((s) => s.socketId !== client.id),
      );
    });
  }

  /**
   * Subscribe to dashboard updates
   */
  handleSubscribe(
    client: any,
    payload: { dashboardId: string; organizationId: string },
  ): void {
    const { dashboardId, organizationId } = payload;

    const subscription: DashboardSubscription = {
      socketId: client.id,
      dashboardId,
      organizationId,
    };

    const existing = this.subscriptions.get(dashboardId) || [];
    existing.push(subscription);
    this.subscriptions.set(dashboardId, existing);

    if (client.join) {
      client.join(`dashboard:${dashboardId}`);
    }

    this.logger.log(`Client ${client.id} subscribed to dashboard ${dashboardId}`);
    client.emit?.('subscribed', { dashboardId });
  }

  /**
   * Unsubscribe from dashboard updates
   */
  handleUnsubscribe(client: any, payload: { dashboardId: string }): void {
    const { dashboardId } = payload;

    const subs = this.subscriptions.get(dashboardId) || [];
    this.subscriptions.set(
      dashboardId,
      subs.filter((s) => s.socketId !== client.id),
    );

    if (client.leave) {
      client.leave(`dashboard:${dashboardId}`);
    }
    client.emit?.('unsubscribed', { dashboardId });
  }

  /**
   * Broadcast widget update to all subscribers
   * Requirement 7.8: Sub-second latency
   */
  broadcastWidgetUpdate(dashboardId: string, widgetId: string, data: any): void {
    const message = {
      type: 'widget_update',
      dashboardId,
      widgetId,
      data,
      timestamp: new Date().toISOString(),
    };

    this.server?.to?.(`dashboard:${dashboardId}`)?.emit?.('widget_update', message);
    this.logger.debug(`Broadcast widget update to dashboard ${dashboardId}`);
  }

  /**
   * Broadcast dashboard config change
   */
  broadcastDashboardChange(dashboardId: string, changeType: string, data: any): void {
    const message = {
      type: 'dashboard_change',
      dashboardId,
      changeType,
      data,
      timestamp: new Date().toISOString(),
    };

    this.server?.to?.(`dashboard:${dashboardId}`)?.emit?.('dashboard_change', message);
  }

  /**
   * Broadcast alert trigger
   */
  broadcastAlert(dashboardId: string, alertData: any): void {
    const message = {
      type: 'alert',
      dashboardId,
      alert: alertData,
      timestamp: new Date().toISOString(),
    };

    this.server?.to?.(`dashboard:${dashboardId}`)?.emit?.('alert', message);
    this.logger.log(`Broadcast alert to dashboard ${dashboardId}`);
  }

  /**
   * Get active subscriptions count for a dashboard
   */
  getSubscribers(dashboardId: string): number {
    return (this.subscriptions.get(dashboardId) || []).length;
  }
}
