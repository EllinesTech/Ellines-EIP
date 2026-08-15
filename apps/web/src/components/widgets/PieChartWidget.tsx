'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { WidgetProps, DataPoint } from './widget.types';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
const MUTED = '#8b95a8';

function syntheticData(seed: number): DataPoint[] {
  return [
    { name: 'Finance', value: Math.max(10, seed) },
    { name: 'Operations', value: Math.max(8, 40 - (seed % 17)) },
    { name: 'People', value: Math.max(6, 28 - (seed % 11)) },
    { name: 'Risk', value: Math.max(4, 16 + (seed % 9)) },
  ];
}

/**
 * Pie / Donut Chart widget.
 *
 * Config keys:
 *   data — [{name, value}]
 */
export default function PieChartWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const data =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as DataPoint[])
      : syntheticData(seed);

  return (
    <div style={{ height }} aria-label="Pie chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart onClick={(e) => onDrillDown?.(e)}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={3}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#11141d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: '#f4f7fb' }}
            labelStyle={{ color: MUTED }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: MUTED }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
