'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import type { WidgetProps, DataPoint } from './widget.types';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
const MUTED = '#8b95a8';

function syntheticData(seed: number): DataPoint[] {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((name, i) => ({
    name,
    value: Math.round(Math.max(18, Math.min(96, seed * 0.55 + ((i * 11 + seed) % 28)))),
  }));
}

/**
 * Bar Chart widget.
 *
 * Config keys:
 *   data — [{name, value}]
 */
export default function BarChartWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const data =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as DataPoint[])
      : syntheticData(seed);

  return (
    <div style={{ height }} aria-label="Bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
          onClick={(e) => onDrillDown?.(e)}
        >
          <defs>
            <linearGradient id={`barGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
          <Tooltip
            contentStyle={{ background: '#11141d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: '#f4f7fb' }}
            labelStyle={{ color: MUTED }}
          />
          <Bar dataKey="value" radius={[6, 6, 3, 3]}>
            {data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
