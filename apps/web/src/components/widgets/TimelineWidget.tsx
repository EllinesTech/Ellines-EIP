'use client';

import type { WidgetProps, TimelineEvent } from './widget.types';

const GREEN = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const BLUE = '#3b82f6';
const MUTED = '#8b95a8';

function eventColor(type?: TimelineEvent['type']): string {
  if (type === 'success') return GREEN;
  if (type === 'warning') return AMBER;
  if (type === 'error') return RED;
  return BLUE;
}

function defaultEvents(): TimelineEvent[] {
  return [
    { id: '1', label: 'System launched', timestamp: '2026-08-01T08:00:00Z', type: 'success' },
    { id: '2', label: 'Data sync completed', timestamp: '2026-08-01T10:30:00Z', type: 'info' },
    { id: '3', label: 'High CPU alert triggered', timestamp: '2026-08-01T14:15:00Z', type: 'warning' },
    { id: '4', label: 'Auto-remediation applied', timestamp: '2026-08-01T14:17:00Z', type: 'success' },
    { id: '5', label: 'Connector error detected', timestamp: '2026-08-01T16:45:00Z', type: 'error' },
  ];
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

/**
 * Timeline widget — horizontal scrollable event timeline.
 *
 * Config keys:
 *   events — [{id, label, timestamp, description?, type?}]
 */
export default function TimelineWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const events =
    Array.isArray(config.events) && config.events.length > 0
      ? (config.events as TimelineEvent[])
      : defaultEvents();

  return (
    <div style={{ height, overflow: 'auto' }} aria-label="Event timeline">
      <div style={{ position: 'relative', paddingLeft: 24, paddingRight: 8 }}>
        {/* Vertical spine */}
        <div
          style={{
            position: 'absolute',
            left: 10,
            top: 8,
            bottom: 8,
            width: 2,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 1,
          }}
        />

        {events.map((event) => {
          const color = eventColor(event.type);
          return (
            <div
              key={event.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                paddingBottom: 14,
                cursor: onDrillDown ? 'pointer' : undefined,
                position: 'relative',
              }}
              onClick={() => onDrillDown?.(event)}
              role={onDrillDown ? 'button' : undefined}
              tabIndex={onDrillDown ? 0 : undefined}
              onKeyDown={onDrillDown ? (e) => e.key === 'Enter' && onDrillDown(event) : undefined}
              aria-label={`Event: ${event.label}`}
            >
              {/* Dot */}
              <div
                style={{
                  position: 'absolute',
                  left: -18,
                  top: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: color,
                  border: '2px solid #0f172a',
                  boxShadow: `0 0 4px ${color}80`,
                }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#f4f7fb' }}>{event.label}</span>
                <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>{formatTime(event.timestamp)}</span>
              </div>
              {event.description ? (
                <div style={{ fontSize: 11, color: MUTED }}>{event.description}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
