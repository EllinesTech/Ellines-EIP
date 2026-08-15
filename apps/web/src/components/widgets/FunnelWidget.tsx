'use client';

import type { WidgetProps, FunnelStep } from './widget.types';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
const MUTED = '#8b95a8';

function syntheticData(): FunnelStep[] {
  return [
    { name: 'Leads', value: 1000, percent: 100 },
    { name: 'Qualified', value: 720, percent: 72 },
    { name: 'Proposals', value: 430, percent: 43 },
    { name: 'Negotiation', value: 210, percent: 21 },
    { name: 'Closed', value: 95, percent: 9.5 },
  ];
}

/**
 * Funnel chart — decreasing horizontal bars visualising a sales/process funnel.
 *
 * Config keys:
 *   data — [{name, value, percent?}]
 */
export default function FunnelWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const rawData =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as FunnelStep[])
      : syntheticData();

  const maxVal = rawData.reduce((m, d) => Math.max(m, d.value), 0) || 1;

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }} aria-label="Funnel chart">
      {rawData.map((step, i) => {
        const widthPct = (step.value / maxVal) * 100;
        const color = COLORS[i % COLORS.length];
        return (
          <div
            key={step.name}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            role={onDrillDown ? 'button' : undefined}
            tabIndex={onDrillDown ? 0 : undefined}
            onClick={() => onDrillDown?.(step)}
            onKeyDown={onDrillDown ? (e) => e.key === 'Enter' && onDrillDown(step) : undefined}
          >
            <div style={{ width: 70, fontSize: 11, color: MUTED, textAlign: 'right', flexShrink: 0 }}>
              {step.name}
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${widthPct}%`,
                  height: Math.max(14, (height - rawData.length * 12) / rawData.length),
                  background: color,
                  borderRadius: 4,
                  transition: 'width 0.4s ease',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  minWidth: 30,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                  {step.value.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
