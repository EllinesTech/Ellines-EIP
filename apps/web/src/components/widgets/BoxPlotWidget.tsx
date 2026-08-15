'use client';

import type { WidgetProps, BoxPlotStats } from './widget.types';

const MUTED = '#8b95a8';
const BLUE = '#3b82f6';
const VIOLET = '#8b5cf6';

function syntheticData(): BoxPlotStats[] {
  return [
    { name: 'Q1', min: 20, q1: 35, median: 50, q3: 68, max: 85 },
    { name: 'Q2', min: 25, q1: 40, median: 58, q3: 72, max: 90 },
    { name: 'Q3', min: 18, q1: 33, median: 47, q3: 63, max: 80 },
    { name: 'Q4', min: 30, q1: 45, median: 62, q3: 75, max: 92 },
  ];
}

interface BoxProps {
  stats: BoxPlotStats;
  min: number;
  max: number;
  barHeight: number;
  color: string;
  onDrillDown?: (item: unknown) => void;
}

function BoxBar({ stats, min: domainMin, max: domainMax, barHeight, color, onDrillDown }: BoxProps) {
  const range = domainMax - domainMin || 1;
  const pct = (v: number) => `${((v - domainMin) / range) * 100}%`;

  const left = pct(stats.min);
  const whiskerLeft = pct(stats.q1);
  const boxWidth = `${((stats.q3 - stats.q1) / range) * 100}%`;
  const medianLeft = pct(stats.median);
  const rightEnd = pct(stats.max);

  return (
    <div
      style={{ position: 'relative', height: barHeight, marginBottom: 4, cursor: onDrillDown ? 'pointer' : undefined }}
      onClick={() => onDrillDown?.(stats)}
      role={onDrillDown ? 'button' : undefined}
      tabIndex={onDrillDown ? 0 : undefined}
      aria-label={`Box plot: ${stats.name}, min ${stats.min}, Q1 ${stats.q1}, median ${stats.median}, Q3 ${stats.q3}, max ${stats.max}`}
    >
      {/* Whisker line */}
      <div style={{ position: 'absolute', left, right: `${100 - parseFloat(rightEnd)}%`, top: '50%', height: 2, background: `${color}88`, transform: 'translateY(-50%)' }} />
      {/* Min cap */}
      <div style={{ position: 'absolute', left, width: 2, top: '25%', height: '50%', background: color }} />
      {/* Max cap */}
      <div style={{ position: 'absolute', left: rightEnd, width: 2, top: '25%', height: '50%', background: color }} />
      {/* Box */}
      <div style={{ position: 'absolute', left: whiskerLeft, width: boxWidth, top: '15%', height: '70%', background: `${color}40`, border: `1.5px solid ${color}`, borderRadius: 3 }} />
      {/* Median line */}
      <div style={{ position: 'absolute', left: medianLeft, width: 2, top: '10%', height: '80%', background: '#f4f7fb' }} />
      {/* Outliers */}
      {stats.outliers?.map((o, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: pct(o),
            top: '35%',
            width: 6,
            height: 6,
            background: '#ef4444',
            borderRadius: '50%',
            transform: 'translateX(-3px)',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Box Plot widget — statistical box & whisker chart.
 *
 * Config keys:
 *   data — [{name, min, q1, median, q3, max, outliers?}]
 */
export default function BoxPlotWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const data =
    Array.isArray(config.data) && config.data.length > 0
      ? (config.data as BoxPlotStats[])
      : syntheticData();

  const allValues = data.flatMap((d) => [d.min, d.max, ...(d.outliers ?? [])]);
  const domainMin = Math.min(...allValues);
  const domainMax = Math.max(...allValues);

  const labelH = 20;
  const availH = height - labelH;
  const barH = Math.max(16, Math.floor(availH / data.length) - 6);

  return (
    <div style={{ height, overflow: 'hidden' }} aria-label="Box plot chart">
      {data.map((stat, i) => (
        <div key={stat.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ width: 36, fontSize: 10, color: MUTED, textAlign: 'right', flexShrink: 0 }}>
            {stat.name}
          </div>
          <div style={{ flex: 1 }}>
            <BoxBar
              stats={stat}
              min={domainMin}
              max={domainMax}
              barHeight={barH}
              color={i % 2 === 0 ? BLUE : VIOLET}
              onDrillDown={onDrillDown}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
