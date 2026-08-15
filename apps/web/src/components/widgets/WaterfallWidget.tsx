'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { WidgetProps, WaterfallSegment } from './widget.types';

const MUTED = '#8b95a8';
const GREEN = '#10b981';
const RED = '#ef4444';
const BLUE = '#3b82f6';

function syntheticData(): WaterfallSegment[] {
  return [
    { name: 'Start', value: 100 },
    { name: 'Revenue +', value: 45 },
    { name: 'COGS −', value: -30 },
    { name: 'OpEx −', value: -20 },
    { name: 'Tax −', value: -10 },
    { name: 'End', value: 0 }, // will be filled as running total
  ];
}

/**
 * Waterfall chart — running total bar chart.
 *
 * Config keys:
 *   data — [{name, value}] where positive = gain, negative = loss
 */
export default function WaterfallWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const rawData =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as WaterfallSegment[])
      : syntheticData();

  // Build waterfall structure: each bar = [offset, value]
  let running = 0;
  const chartData = rawData.map((seg, i) => {
    const isLast = i === rawData.length - 1;
    const offset = isLast ? 0 : running;
    const value = isLast ? running : seg.value;
    if (!isLast) running += seg.value;
    return {
      name: seg.name,
      offset,
      value: Math.abs(value),
      raw: seg.value,
      isLast,
    };
  });

  return (
    <div style={{ height }} aria-label="Waterfall chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
          onClick={(e) => onDrillDown?.(e)}
        >
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" stroke={MUTED} tickLine={false} axisLine={false} fontSize={10} />
          <YAxis stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
          <Tooltip
            contentStyle={{ background: '#11141d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: '#f4f7fb' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(val: any, name: any) => (name === 'offset' ? null : [val, 'Value']) as any}
          />
          {/* Transparent offset bar to push visible bar up */}
          <Bar dataKey="offset" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="wf" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {chartData.map((d, i) => (
              <Cell
                key={`cell-${i}`}
                fill={d.isLast ? BLUE : d.raw >= 0 ? GREEN : RED}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
