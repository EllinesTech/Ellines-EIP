'use client';

import type { WidgetProps, AlertEntry, Severity } from './widget.types';

const MUTED = '#8b95a8';

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; label: string }> = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'CRITICAL' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.12)', label: 'HIGH' },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'MEDIUM' },
  low:      { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'LOW' },
  info:     { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: 'INFO' },
};

function defaultAlerts(): AlertEntry[] {
  return [
    { id: '1', title: 'High CPU Usage on API Gateway', severity: 'critical', source: 'Monitor', timestamp: '2026-08-01T14:15:00Z' },
    { id: '2', title: 'ERP Sync Delay > 5 min', severity: 'high', source: 'Connector', timestamp: '2026-08-01T13:50:00Z' },
    { id: '3', title: 'Memory utilization at 82%', severity: 'medium', source: 'Infra', timestamp: '2026-08-01T12:00:00Z' },
    { id: '4', title: 'Scheduled report pending', severity: 'low', source: 'Jobs', timestamp: '2026-08-01T10:30:00Z' },
    { id: '5', title: 'New connector pack available', severity: 'info', source: 'Platform', timestamp: '2026-08-01T09:00:00Z' },
  ];
}

function formatTime(ts?: string): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

/**
 * Alert List widget — list of alerts with severity colour coding.
 *
 * Config keys:
 *   alerts — [{id, title, message?, severity, timestamp?, source?, acknowledged?}]
 */
export default function AlertListWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const alerts =
    Array.isArray(config.alerts) && config.alerts.length > 0
      ? (config.alerts as AlertEntry[])
      : defaultAlerts();

  return (
    <div style={{ height, overflow: 'auto' }} aria-label="Alert list" role="list">
      {alerts.map((alert) => {
        const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
        const dimmed = alert.acknowledged ? 0.5 : 1;

        return (
          <div
            key={alert.id}
            role="listitem"
            style={{
              display: 'flex',
              gap: 10,
              padding: '7px 4px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              cursor: onDrillDown ? 'pointer' : undefined,
              opacity: dimmed,
              alignItems: 'flex-start',
            }}
            onClick={() => onDrillDown?.(alert)}
            onKeyDown={onDrillDown ? (e) => e.key === 'Enter' && onDrillDown(alert) : undefined}
            tabIndex={onDrillDown ? 0 : undefined}
            aria-label={`Alert: ${alert.title}, severity ${alert.severity}`}
          >
            {/* Severity badge */}
            <div
              style={{
                flexShrink: 0,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: sev.color,
                background: sev.bg,
                padding: '1px 5px',
                borderRadius: 3,
                marginTop: 2,
                minWidth: 52,
                textAlign: 'center',
              }}
              aria-hidden
            >
              {sev.label}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#f4f7fb', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {alert.title}
              </div>
              {alert.message ? (
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {alert.message}
                </div>
              ) : null}
            </div>

            {/* Metadata */}
            <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 10, color: MUTED }}>
              {formatTime(alert.timestamp)}
              {alert.source ? <div style={{ marginTop: 2 }}>{alert.source}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
