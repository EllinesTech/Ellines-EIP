/**
 * Dashboard WebSocket Gateway
 * 
 * Real-time dashboard updates via WebSocket
 * Requirement 7.8, 20.4: Sub-second WebSocket update latency
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

interface DashboardSubscription {
  socketId: string;
  dashboardId: string;
  organizationId: string;
}

@WebSocketGateway({ cors: true, namespace: '/dashboards' })
export class DashboardWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DashboardWebSocketGateway.name);
  private subscriptions: Map<string, DashboardSubscription[]> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Remove client from all subscriptions
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
  @SubscribeMessage('subscribe')
  handleSubscribe(
    client: Socket,
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

    client.join(`dashboard:${dashboardId}`);
    this.logger.log(`Client ${client.id} subscribed to dashboard ${dashboardId}`);

    client.emit('subscribed', { dashboardId });
  }

  /**
   * Unsubscribe from dashboard updates
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, payload: { dashboardId: string }): void {
    const { dashboardId } = payload;
    
    const subs = this.subscriptions.get(dashboardId) || [];
    this.subscriptions.set(
      dashboardId,
      subs.filter((s) => s.socketId !== client.id),
    );

    client.leave(`dashboard:${dashboardId}`);
    this.logger.log(`Client ${client.id} unsubscribed from dashboard ${dashboardId}`);

    client.emit('unsubscribed', { dashboardId });
  }

  /**
   * Broadcast widget update to all subscribers
   * Requirement 7.8: Sub-second latency
   */
  broadcastWidgetUpdate(
    dashboardId: string,
    widgetId: string,
    data: any,
  ): void {
    const message = {
      type: 'widget_update',
      dashboardId,
      widgetId,
      data,
      timestamp: new Date().toISOString(),
    };

    this.server.to(`dashboard:${dashboardId}`).emit('widget_update', message);
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

    this.server.to(`dashboard:${dashboardId}`).emit('dashboard_change', message);
    this.logger.debug(`Broadcast dashboard change: ${changeType} to dashboard ${dashboardId}`);
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

    this.server.to(`dashboard:${dashboardId}`).emit('alert', message);
    this.logger.log(`Broadcast alert to dashboard ${dashboardId}`);
  }

  /**
   * Get active subscriptions for a dashboard
   */
  getSubscribers(dashboardId: string): number {
    return (this.subscriptions.get(dashboardId) || []).length;
  }
}
