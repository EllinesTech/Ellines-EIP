'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';
import type { WidgetProps, DataPoint, TrendDirection } from './widget.types';

const BLUE = '#3b82f6';
const GREEN = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const MUTED = '#8b95a8';

function trendColor(dir?: TrendDirection): string {
  if (dir === 'up') return GREEN;
  if (dir === 'down') return RED;
  return MUTED;
}

function TrendArrow({ dir }: { dir?: TrendDirection }) {
  if (dir === 'up') {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M7 2l5 7H2l5-7z" fill={GREEN} />
      </svg>
    );
  }
  if (dir === 'down') {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M7 12L2 5h10l-5 7z" fill={RED} />
      </svg>
    );
  }
  return (
    <svg width={14} height={10} viewBox="0 0 14 10" fill="none" aria-hidden>
      <path d="M1 5h12" stroke={MUTED} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** Generates a plausible sparkline from a numeric seed. */
function syntheticSpark(seed: number, n = 10): DataPoint[] {
  const pts: DataPoint[] = [];
  let v = Math.max(20, seed % 80);
  for (let i = 0; i < n; i++) {
    v = Math.max(10, Math.min(100, v + ((i * 17 + seed) % 13) - 6));
    pts.push({ name: String(i + 1), value: Math.round(v) });
  }
  return pts;
}

/**
 * KPI Card — shows a large metric value with trend arrow and mini sparkline.
 *
 * Config keys:
 *   value     — the metric value (number or string)
 *   unit      — appended to value (e.g. "%" or "K")
 *   delta     — change indicator (e.g. "+4.2%" or -12)
 *   deltaLabel— short label for the delta (e.g. "vs last month")
 *   trend     — 'up' | 'down' | 'flat'
 *   sparklineData — [{name, value}] array for the mini chart
 */
export default function KpiCard({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const rawValue = config.value;
  const unit = typeof config.unit === 'string' ? config.unit : '';
  const displayValue = rawValue !== undefined ? `${rawValue}${unit}` : String(50 + seed);

  const delta = config.delta !== undefined ? String(config.delta) : seed % 2 === 0 ? '+4.2%' : '−1.8%';
  const deltaLabel = typeof config.deltaLabel === 'string' ? config.deltaLabel : '';
  const trend: TrendDirection =
    config.trend === 'up' || config.trend === 'down' || config.trend === 'flat'
      ? config.trend
      : delta.startsWith('+') || delta.startsWith('▲')
        ? 'up'
        : delta.startsWith('−') || delta.startsWith('-') || delta.startsWith('▼')
          ? 'down'
          : 'flat';

  const sparkData =
    Array.isArray(config.sparklineData) && config.sparklineData.length > 0
      ? (config.sparklineData as DataPoint[])
      : syntheticSpark(seed);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 8, height, justifyContent: 'flex-end', cursor: onDrillDown ? 'pointer' : undefined }}
      onClick={() => onDrillDown?.({ type: 'kpi', value: rawValue })}
      role={onDrillDown ? 'button' : undefined}
      tabIndex={onDrillDown ? 0 : undefined}
      onKeyDown={onDrillDown ? (e) => e.key === 'Enter' && onDrillDown({ type: 'kpi', value: rawValue }) : undefined}
      aria-label={onDrillDown ? `Drill down: ${displayValue}` : undefined}
    >
      <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f4f7fb', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {displayValue}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <TrendArrow dir={trend} />
        <span style={{ fontSize: 12, fontWeight: 600, color: trendColor(trend) }}>{delta}</span>
        {deltaLabel ? <span style={{ fontSize: 11, color: MUTED, marginLeft: 2 }}>{deltaLabel}</span> : null}
      </div>
      <div style={{ height: 36 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
            <Line type="monotone" dataKey="value" stroke={BLUE} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
