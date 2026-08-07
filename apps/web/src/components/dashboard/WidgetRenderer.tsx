'use client';

import type { WidgetDto } from '@/lib/api';
import {
  AreaPulse,
  BarWeek,
  DonutStatus,
  HeatmapGrid,
  Sparkline,
  chartColors,
  pulseSeries,
  sparkSeries,
  weekSeries,
  type ChartPoint,
} from '@/components/dashboard/charts';

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 70) + 25;
}

function pointsFromConfig(config: Record<string, unknown> | undefined): ChartPoint[] | null {
  const raw = config?.data;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const pts: ChartPoint[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = String(r.name ?? r.label ?? '');
    const value = Number(r.value);
    if (!name || !Number.isFinite(value)) continue;
    pts.push({ name, value });
  }
  return pts.length ? pts : null;
}

function kpiValue(config: Record<string, unknown> | undefined, seed: number): { value: string; delta: string } {
  if (typeof config?.value === 'number' || typeof config?.value === 'string') {
    const unit = typeof config.unit === 'string' ? config.unit : '';
    const delta =
      typeof config.delta === 'string' || typeof config.delta === 'number'
        ? String(config.delta)
        : '';
    return { value: `${config.value}${unit}`, delta };
  }
  return { value: String(seed), delta: seed % 2 === 0 ? '+4%' : '−2%' };
}

export default function WidgetRenderer({ widget }: { widget: WidgetDto }) {
  const seed = hashSeed(widget.id);
  const config = (widget.config || {}) as Record<string, unknown>;
  const custom = pointsFromConfig(config);
  const type = (widget.type || 'kpi').toLowerCase();

  if (type === 'kpi') {
    const { value, delta } = kpiValue(config, seed);
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6, minHeight: 0 }}>
        <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#f4f7fb', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {value}
        </div>
        {delta ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: delta.startsWith('−') || delta.startsWith('-') ? chartColors.AMBER : chartColors.GREEN }}>
            {delta}
          </div>
        ) : null}
        <div style={{ height: 28, marginTop: 4 }}>
          <Sparkline data={custom ?? sparkSeries(seed, 10)} color={chartColors.BLUE} />
        </div>
      </div>
    );
  }

  if (type === 'gauge') {
    const value = typeof config.value === 'number' ? Math.max(0, Math.min(100, config.value)) : seed;
    const remainder = Math.max(0, 100 - value);
    return (
      <div style={{ flex: 1, minHeight: 0, paddingTop: 4 }}>
        <DonutStatus
          segments={[
            { name: 'Score', value, color: chartColors.BLUE },
            { name: 'Remainder', value: remainder, color: 'rgba(255,255,255,0.08)' },
          ]}
          center={`${Math.round(value)}%`}
        />
      </div>
    );
  }

  if (type === 'line') {
    return (
      <div style={{ flex: 1, minHeight: 0, paddingTop: 6 }}>
        <AreaPulse data={custom ?? pulseSeries(seed)} color={chartColors.BLUE} />
      </div>
    );
  }

  if (type === 'bar') {
    return (
      <div style={{ flex: 1, minHeight: 0, paddingTop: 6 }}>
        <BarWeek data={custom ?? weekSeries(seed)} />
      </div>
    );
  }

  if (type === 'pie') {
    const segments =
      custom && custom.length
        ? custom.map((p, i) => ({
            name: p.name,
            value: p.value,
            color: [chartColors.BLUE, chartColors.VIOLET, chartColors.GREEN, chartColors.AMBER, chartColors.RED][i % 5],
          }))
        : [
            { name: 'Ops', value: Math.max(10, seed - 5), color: chartColors.BLUE },
            { name: 'Finance', value: Math.max(8, 40 - (seed % 17)), color: chartColors.VIOLET },
            { name: 'People', value: Math.max(6, 28 - (seed % 11)), color: chartColors.GREEN },
          ];
    const total = segments.reduce((s, x) => s + x.value, 0);
    return (
      <div style={{ flex: 1, minHeight: 0, paddingTop: 4 }}>
        <DonutStatus segments={segments} center={String(Math.round(total))} />
      </div>
    );
  }

  if (type === 'heatmap') {
    return (
      <div style={{ flex: 1, minHeight: 0, paddingTop: 6 }}>
        <HeatmapGrid seed={seed} />
      </div>
    );
  }

  if (type === 'table') {
    const rows = custom?.slice(0, 5) ?? weekSeries(seed).slice(0, 5);
    return (
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', marginTop: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: chartColors.MUTED, textAlign: 'left' }}>
              <th style={{ padding: '2px 4px', fontWeight: 600 }}>Label</th>
              <th style={{ padding: '2px 4px', fontWeight: 600 }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '3px 4px', color: '#c8d0dc' }}>{r.name}</td>
                <td style={{ padding: '3px 4px', color: '#f4f7fb', fontWeight: 700 }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: chartColors.MUTED, fontSize: 12 }}>
      Unsupported widget type
    </div>
  );
}
