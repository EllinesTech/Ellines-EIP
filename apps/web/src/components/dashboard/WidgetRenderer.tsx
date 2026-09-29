'use client';

import type { WidgetDto } from '@/lib/api';
import {
  AreaPulse,
  BarWeek,
  DonutStatus,
  Sparkline,
  chartColors,
  type ChartPoint,
} from '@/components/dashboard/charts';

/** No-data placeholder shown instead of any synthetic fallback. */
function NoData({ label }: { label?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        placeItems: 'center',
        color: chartColors.MUTED,
        fontSize: 12,
        padding: '0.75rem',
        textAlign: 'center',
        lineHeight: 1.4,
      }}
    >
      {label ?? 'No data — configure this widget with real data to display here.'}
    </div>
  );
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

export default function WidgetRenderer({ widget }: { widget: WidgetDto }) {
  const config = (widget.config || {}) as Record<string, unknown>;
  const custom = pointsFromConfig(config);
  const type = (widget.type || 'kpi').toLowerCase();

  // ── KPI ───────────────────────────────────────────────────────────────────
  if (type === 'kpi') {
    const hasValue = config.value !== undefined && config.value !== null && config.value !== '';
    if (!hasValue) {
      return <NoData label="No value configured. Edit this widget and set a value." />;
    }
    const unit = typeof config.unit === 'string' ? config.unit : '';
    const delta =
      typeof config.delta === 'string' || typeof config.delta === 'number'
        ? String(config.delta)
        : '';
    const trendData = custom; // only show sparkline if real data is provided in config.data
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6, minHeight: 0 }}>
        <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#f4f7fb', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {String(config.value)}{unit}
        </div>
        {delta ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: delta.startsWith('−') || delta.startsWith('-') ? chartColors.AMBER : chartColors.GREEN }}>
            {delta}
          </div>
        ) : null}
        {trendData ? (
          <div style={{ height: 28, marginTop: 4 }}>
            <Sparkline data={trendData} color={chartColors.BLUE} />
          </div>
        ) : null}
      </div>
    );
  }

  // ── Gauge ─────────────────────────────────────────────────────────────────
  if (type === 'gauge') {
    if (typeof config.value !== 'number') {
      return <NoData label="No value configured. Edit this widget and set a numeric value (0–100)." />;
    }
    const value = Math.max(0, Math.min(100, config.value));
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

  // ── Line chart ────────────────────────────────────────────────────────────
  if (type === 'line') {
    if (!custom) return <NoData label="No data points configured. Edit this widget and add data." />;
    return (
      <div style={{ flex: 1, minHeight: 0, paddingTop: 6 }}>
        <AreaPulse data={custom} color={chartColors.BLUE} />
      </div>
    );
  }

  // ── Bar chart ─────────────────────────────────────────────────────────────
  if (type === 'bar') {
    if (!custom) return <NoData label="No data points configured. Edit this widget and add data." />;
    return (
      <div style={{ flex: 1, minHeight: 0, paddingTop: 6 }}>
        <BarWeek data={custom} />
      </div>
    );
  }

  // ── Pie / donut ───────────────────────────────────────────────────────────
  if (type === 'pie') {
    if (!custom || !custom.length) {
      return <NoData label="No segments configured. Edit this widget and add data points." />;
    }
    const segments = custom.map((p, i) => ({
      name: p.name,
      value: p.value,
      color: [chartColors.BLUE, chartColors.VIOLET, chartColors.GREEN, chartColors.AMBER, chartColors.RED][i % 5],
    }));
    const total = segments.reduce((s, x) => s + x.value, 0);
    return (
      <div style={{ flex: 1, minHeight: 0, paddingTop: 4 }}>
        <DonutStatus segments={segments} center={String(Math.round(total))} />
      </div>
    );
  }

  // ── Heatmap ───────────────────────────────────────────────────────────────
  // Heatmap requires real activity-by-day data (not seed-based). Show placeholder.
  if (type === 'heatmap') {
    return <NoData label="Heatmap requires activity data. Configure data points (date, value) to display." />;
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  if (type === 'table') {
    if (!custom || !custom.length) {
      return <NoData label="No rows configured. Edit this widget and add data." />;
    }
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
            {custom.slice(0, 10).map((r) => (
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
