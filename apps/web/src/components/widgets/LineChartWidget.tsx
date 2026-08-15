'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { WidgetProps, DataPoint } from './widget.types';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
const MUTED = '#8b95a8';

function syntheticSeries(seed: number, points = 8): DataPoint[] {
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'].slice(0, points);
  let v = Math.max(20, seed % 80);
  return labels.map((name, i) => {
    v = Math.max(10, Math.min(100, v + ((i * 11 + seed) % 15) - 7));
    return { name, value: Math.round(v) };
  });
}

/**
 * Line Chart widget — supports single or multi-series.
 *
 * Config keys:
 *   data    — [{name, value}] for single series
 *   series  — [{name, data:[{name,value}], color}] for multi-series
 */
export default function LineChartWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const hasSeries = Array.isArray(config.series) && config.series.length > 0;

  // Build unified data array
  let chartData: Record<string, unknown>[];
  let seriesKeys: { key: string; color: string }[];

  if (hasSeries) {
    const series = config.series as { name: string; data: DataPoint[]; color?: string }[];
    // Merge all series onto shared x-axis by name
    const nameSet = new Set<string>();
    series.forEach((s) => s.data.forEach((p) => nameSet.add(p.name)));
    const names = Array.from(nameSet);
    chartData = names.map((name) => {
      const row: Record<string, unknown> = { name };
      series.forEach((s) => {
        const pt = s.data.find((p) => p.name === name);
        row[s.name] = pt?.value ?? null;
      });
      return row;
    });
    seriesKeys = series.map((s, i) => ({ key: s.name, color: s.color ?? COLORS[i % COLORS.length] }));
  } else {
    const data =
      Array.isArray(config.data) && config.data.length > 0
        ? (config.data as DataPoint[])
        : syntheticSeries(seed);
    chartData = data as unknown as Record<string, unknown>[];
    seriesKeys = [{ key: 'value', color: COLORS[0] }];
  }

  return (
    <div style={{ height }} aria-label="Line chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
          onClick={(e) => onDrillDown?.(e)}
        >
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
          <Tooltip
            contentStyle={{ background: '#11141d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: '#f4f7fb' }}
            labelStyle={{ color: MUTED }}
          />
          {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: MUTED }} />}
          {seriesKeys.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
