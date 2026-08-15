'use client';

import type { WidgetProps } from './widget.types';

const MUTED = '#8b95a8';

/**
 * Heat Map widget — CSS grid with color intensity scaling.
 *
 * Config keys:
 *   data       — flat [{name, value}] list; value 0-100 maps to intensity
 *   rows_count — grid row count (default 4)
 *   cols_count — grid col count (default 7)
 */
export default function HeatMapWidget({ id, config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const seed = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 100;

  const rows = typeof config.rows_count === 'number' ? config.rows_count : 4;
  const cols = typeof config.cols_count === 'number' ? config.cols_count : 7;

  const total = rows * cols;
  const cells: { name: string; intensity: number }[] = [];

  if (Array.isArray(config.data) && config.data.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config.data is typed as DataPoint[] but we allow generic records
    const d = config.data as any[];
    for (let i = 0; i < total; i++) {
      const item = d[i] ?? {};
      cells.push({ name: String(item.name ?? i), intensity: Math.min(100, Math.max(0, Number(item.value ?? 0))) / 100 });
    }
  } else {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          name: `${r},${c}`,
          intensity: (((seed * 17 + r * 13 + c * 7) % 100) / 100),
        });
      }
    }
  }

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].slice(0, cols);

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }} aria-label="Heat map">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 4,
          flex: 1,
          minHeight: 0,
        }}
      >
        {cells.map((cell, i) => {
          const alpha = 0.12 + cell.intensity * 0.78;
          return (
            <div
              key={i}
              title={`${cell.name}: ${Math.round(cell.intensity * 100)}`}
              role={onDrillDown ? 'button' : undefined}
              tabIndex={onDrillDown ? 0 : undefined}
              onClick={() => onDrillDown?.(cell)}
              onKeyDown={onDrillDown ? (e) => e.key === 'Enter' && onDrillDown(cell) : undefined}
              style={{
                borderRadius: 4,
                background: `rgba(37, 99, 235, ${alpha.toFixed(3)})`,
                minHeight: 10,
                cursor: onDrillDown ? 'pointer' : undefined,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 4,
          color: MUTED,
          fontSize: 10,
          textAlign: 'center',
          fontWeight: 600,
        }}
      >
        {dayLabels.map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
    </div>
  );
}
