'use client';

import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import type { WidgetProps, DataPoint } from './widget.types';

const BLUE = '#3b82f6';

function syntheticData(seed: number, n = 12): DataPoint[] {
  const pts: DataPoint[] = [];
  let v = Math.max(20, seed % 80);
  for (let i = 0; i < n; i++) {
    v = Math.max(5, Math.min(100, v + ((i * 17 + seed) % 13) - 6));
    pts.push({ name: String(i + 1), value: Math.round(v) });
  }
  return pts;
}

/**
 * Sparkline widget — tiny inline trend line.
 *
 * Config keys:
 *   data  — [{name, value}]
 *   color — stroke colour hex
 */
export default function SparklineWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const data =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as DataPoint[])
      : syntheticData(seed);

  const color = typeof config.colorScheme === 'string' ? config.colorScheme : BLUE;

  return (
    <div style={{ height }} aria-label="Sparkline trend">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 0, left: 0, bottom: 4 }}
          onClick={(e) => onDrillDown?.(e)}
        >
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Tooltip
            contentStyle={{ background: '#11141d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 11 }}
            itemStyle={{ color: '#f4f7fb' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
