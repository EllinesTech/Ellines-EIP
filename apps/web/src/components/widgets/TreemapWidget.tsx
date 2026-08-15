'use client';

import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import type { WidgetProps, TreemapLeaf } from './widget.types';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316'];
const MUTED = '#8b95a8';

function syntheticData(): TreemapLeaf[] {
  return [
    { name: 'Revenue', size: 400 },
    { name: 'Operations', size: 280 },
    { name: 'People', size: 220 },
    { name: 'Risk', size: 150 },
    { name: 'IT', size: 180 },
    { name: 'Finance', size: 320 },
  ];
}

/**
 * Treemap widget — hierarchical area proportional chart.
 *
 * Config keys:
 *   data — [{name, size, children?}]
 */
export default function TreemapWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const data =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as TreemapLeaf[])
      : syntheticData();

  return (
    <div style={{ height }} aria-label="Treemap chart">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data as any}
          dataKey="size"
          nameKey="name"
          isAnimationActive={false}
          onClick={(node) => onDrillDown?.(node)}
          content={(props) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts content props type is complex
            const p = props as any;
            const { x, y, width, height: h, name, index } = p;
            if (!width || !h || width < 20 || h < 20) return <g />;
            const color = COLORS[Number(index) % COLORS.length];
            return (
              <g>
                <rect x={x} y={y} width={width} height={h} fill={color} fillOpacity={0.8} stroke="#0f172a" strokeWidth={2} rx={4} />
                {width > 50 && h > 30 ? (
                  <text x={x + width / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={11} fontWeight={600}>
                    {String(name)}
                  </text>
                ) : null}
              </g>
            );
          }}
        />
      </ResponsiveContainer>
    </div>
  );
}
