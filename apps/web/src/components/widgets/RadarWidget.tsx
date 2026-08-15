'use client';

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { WidgetProps, RadarAxis } from './widget.types';

const MUTED = '#8b95a8';

function syntheticData(seed: number): RadarAxis[] {
  const subjects = ['Finance', 'Operations', 'People', 'Customer', 'Risk'];
  return subjects.map((subject, i) => ({
    subject,
    value: Math.round(Math.max(30, Math.min(95, seed + ((i * 13 + seed) % 25)))),
    fullMark: 100,
  }));
}

/**
 * Radar chart widget.
 *
 * Config keys:
 *   data — [{subject, value, fullMark?}]
 */
export default function RadarWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const data =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as RadarAxis[])
      : syntheticData(seed);

  return (
    <div style={{ height }} aria-label="Radar chart">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} onClick={(e) => onDrillDown?.(e)}>
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: MUTED, fontSize: 11 }} />
          <Radar
            name="Score"
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.3}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{ background: '#11141d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: '#f4f7fb' }}
            labelStyle={{ color: MUTED }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
