'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { WidgetProps } from './widget.types';

const MUTED = '#8b95a8';

/**
 * Gauge widget — circular arc showing a 0–100 score.
 *
 * Config keys:
 *   value — numeric 0–100
 *   min   — minimum (default 0)
 *   max   — maximum (default 100)
 *   thresholds — [{value, color}] optional colour bands
 */
export default function GaugeWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const min = typeof config.min === 'number' ? config.min : 0;
  const max = typeof config.max === 'number' ? config.max : 100;
  const rawVal = typeof config.value === 'number' ? config.value : seed;
  const pct = Math.max(0, Math.min(100, ((rawVal - min) / (max - min)) * 100));
  const remainder = 100 - pct;

  // Pick gauge fill colour from thresholds or default
  let fillColor = '#3b82f6';
  if (Array.isArray(config.thresholds)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thresholds entries are config-level generic objects
    const thresholds = config.thresholds as any[];
    const sorted = [...thresholds].sort((a, b) => Number(a.value) - Number(b.value));
    for (const t of sorted) {
      if (rawVal >= Number(t.value)) fillColor = String(t.color ?? fillColor);
    }
  }

  return (
    <div
      style={{ height, position: 'relative', cursor: onDrillDown ? 'pointer' : undefined }}
      onClick={() => onDrillDown?.({ type: 'gauge', value: rawVal })}
      role={onDrillDown ? 'button' : undefined}
      tabIndex={onDrillDown ? 0 : undefined}
      onKeyDown={onDrillDown ? (e) => e.key === 'Enter' && onDrillDown({ type: 'gauge', value: rawVal }) : undefined}
      aria-label={`Gauge: ${Math.round(rawVal)}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={[
              { value: pct },
              { value: remainder },
            ]}
            dataKey="value"
            startAngle={225}
            endAngle={-45}
            innerRadius="65%"
            outerRadius="85%"
            paddingAngle={0}
            stroke="none"
          >
            <Cell fill={fillColor} />
            <Cell fill="rgba(255,255,255,0.07)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f4f7fb', letterSpacing: '-0.03em' }}>
            {Math.round(pct)}%
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            {rawVal} / {max}
          </div>
        </div>
      </div>
    </div>
  );
}
