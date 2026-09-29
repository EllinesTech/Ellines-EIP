'use client';

/**
 * useDashboardSocket — Task 18.2
 *
 * WebSocket hook for real-time dashboard widget updates.
 *
 * Connects to the EIP identity service WebSocket (namespace /dashboards).
 * Falls back gracefully when the socket.io client is not available or
 * the server is unreachable (static export / offline mode).
 *
 * Requirement 7.8, 20.4: Sub-second WebSocket update latency
 *
 * Usage:
 *   const { connected, lastEvent } = useDashboardSocket(dashboardId, orgId);
 */

import { useEffect, useRef, useState } from 'react';

export interface DashboardSocketEvent {
  type: 'widget_update' | 'widget-update' | 'dashboard_change' | 'alert';
  dashboardId: string;
  widgetId?: string;
  data?: unknown;
  timestamp: string;
}

export interface UseDashboardSocketResult {
  /** Whether the WebSocket is currently connected */
  connected: boolean;
  /** Most recently received event (null until first event) */
  lastEvent: DashboardSocketEvent | null;
  /** Disconnect and clean up the socket */
  disconnect: () => void;
}

export function useDashboardSocket(
  dashboardId: string | undefined,
  organizationId: string | undefined,
): UseDashboardSocketResult {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DashboardSocketEvent | null>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!dashboardId || !organizationId) return;

    // Derive the API URL (same logic as lib/api.ts)
    const apiBase =
      typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL ||
            (window.location.hostname === 'localhost'
              ? 'http://localhost:3001'
              : ''))
        : '';

    if (!apiBase) return;

    let active = true;

    // Dynamically import socket.io-client (not a hard dependency)
    import('socket.io-client')
      .then(({ io }) => {
        if (!active) return;

        const socket = io(`${apiBase}/dashboards`, {
          transports: ['websocket', 'polling'],
          autoConnect: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          if (!active) return;
          setConnected(true);
          // Subscribe to this specific dashboard
          socket.emit('subscribe', { dashboardId, organizationId });
        });

        socket.on('disconnect', () => {
          if (!active) return;
          setConnected(false);
        });

        // Listen on both event name variants emitted by the gateway
        const handler = (event: DashboardSocketEvent) => {
          if (!active) return;
          setLastEvent(event);
        };

        socket.on('widget_update', handler);
        socket.on('widget-update', handler);
        socket.on('dashboard_change', handler);
        socket.on('alert', handler);
      })
      .catch(() => {
        // socket.io-client not installed — silent fallback (polling only)
      });

    return () => {
      active = false;
      if (socketRef.current) {
        socketRef.current.emit('unsubscribe', { dashboardId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [dashboardId, organizationId]);

  function disconnect() {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnected(false);
  }

  return { connected, lastEvent, disconnect };
}
