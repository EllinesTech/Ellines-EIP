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
   * Broadcast widget update to all subscribers of a dashboard.
   *
   * Two call signatures are supported:
   *   1. broadcastWidgetUpdate(dashboardId, orgId)
   *      — emits `{ event: 'widget-update', dashboardId }` to room `dashboard:${dashboardId}`
   *        (Requirement 18.2 spec interface)
   *   2. broadcastWidgetUpdate(dashboardId, widgetId, data)
   *      — legacy signature kept for internal callers
   *
   * Requirement 7.8, 20.4: Sub-second latency
   */
  broadcastWidgetUpdate(dashboardId: string, orgIdOrWidgetId: string, data?: any): void {
    const isSpecInterface = data === undefined;

    if (isSpecInterface) {
      // Spec-required: broadcastWidgetUpdate(dashboardId, orgId)
      const message = { event: 'widget-update', dashboardId };
      this.server?.to?.(`dashboard:${dashboardId}`)?.emit?.('widget-update', message);
      this.logger.debug(`broadcastWidgetUpdate (spec): widget-update → dashboard:${dashboardId}`);
      return;
    }

    // Legacy: broadcastWidgetUpdate(dashboardId, widgetId, data)
    const widgetId = orgIdOrWidgetId;
    const message = {
      type: 'widget_update',
      dashboardId,
      widgetId,
      data,
      timestamp: new Date().toISOString(),
    };

    this.server?.to?.(`dashboard:${dashboardId}`)?.emit?.('widget_update', message);
    // Also emit on the canonical 'widget-update' channel (Requirement 20.4)
    this.server?.to?.(`dashboard:${dashboardId}`)?.emit?.('widget-update', message);
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
   * Handle cache invalidation event — push widget-update to all dashboard rooms in the org.
   * Requirement 7.8, 20.4: Real-time invalidation broadcast
   *
   * @param orgId  Organization whose widget cache has been invalidated.
   *               All dashboards subscribed to by clients in this org are notified.
   */
  handleInvalidation(orgId: string): void {
    const dashboardIds = Array.from(this.subscriptions.entries())
      .filter(([, subs]) => subs.some((s) => s.organizationId === orgId))
      .map(([dashboardId]) => dashboardId);

    const payload = { event: 'widget-update', orgId, timestamp: new Date().toISOString() };

    for (const dashboardId of dashboardIds) {
      this.server?.to?.(`dashboard:${dashboardId}`)?.emit?.('widget-update', payload);
      this.logger.debug(`handleInvalidation: pushed widget-update to dashboard:${dashboardId}`);
    }

    // Fallback: if no specific rooms are tracked yet, broadcast org-level event
    if (dashboardIds.length === 0) {
      this.server?.emit?.('widget-update', payload);
      this.logger.debug(`handleInvalidation: no tracked rooms for org=${orgId}; broadcast sent`);
    }
  }

  /**
   * Get active subscriptions count for a dashboard
   */
  getSubscribers(dashboardId: string): number {
    return (this.subscriptions.get(dashboardId) || []).length;
  }
}
