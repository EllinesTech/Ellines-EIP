'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { WidgetProps, ScatterPoint } from './widget.types';

const MUTED = '#8b95a8';

function syntheticData(seed: number): ScatterPoint[] {
  const pts: ScatterPoint[] = [];
  for (let i = 0; i < 20; i++) {
    pts.push({
      x: Math.round(((seed * 7 + i * 11) % 90) + 5),
      y: Math.round(((seed * 13 + i * 7) % 85) + 5),
      name: `Point ${i + 1}`,
    });
  }
  return pts;
}

/**
 * Scatter chart widget.
 *
 * Config keys:
 *   data — [{x, y, name?}]
 */
export default function ScatterWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const data =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as ScatterPoint[])
      : syntheticData(seed);

  return (
    <div style={{ height }} aria-label="Scatter chart">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
          onClick={(e) => onDrillDown?.(e)}
        >
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="x" name="X" stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis dataKey="y" name="Y" stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
          <Tooltip
            contentStyle={{ background: '#11141d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: '#f4f7fb' }}
            cursor={{ strokeDasharray: '3 3' }}
          />
          <Scatter data={data} fill="#8b5cf6" opacity={0.8} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
