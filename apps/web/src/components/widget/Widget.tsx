'use client';

/**
 * Widget — Self-contained, typed dashboard widget.
 *
 * - Looks up widgetTypeId in WIDGET_REGISTRY. Unknown type → error placeholder.
 * - Schedules its own data refresh; clears interval on unmount (Req 5.5).
 * - Drill-down capable types: KPI, Table, FinancialSummary, InventorySummary, AlertList (Req 4.7).
 * - Drill-down depth capped at 3 (Req 4.7).
 * - Charts provide a screen-reader accessible data table (Req 11.2).
 * - When connector DISABLED/ERROR: shows error_state with staleness label (Req 4.6).
 *
 * Requirements: 4.1–4.9, 5.1–5.5, 11.2
 */

import React, { useEffect, useState, useCallback } from 'react';
import { WIDGET_REGISTRY } from '@ellines-eip/shared';
import { FreshnessIndicator } from '../freshness-indicator/FreshnessIndicator';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WidgetPosition {
  col: number;
  row: number;
  width: number;
  height: number;
}

interface WidgetProps {
  widgetId: string;
  widgetTypeId: string;
  config: Record<string, unknown>;
  dataSourceRef: string | null;
  lastFetchedAt: Date | null;
  errorState: string | null;
  refreshOverrideSeconds: number | null;
  position: WidgetPosition;
  /** Default dashboard refresh policy in seconds (used when refreshOverride is null). */
  dashboardRefreshPolicy?: number;
  onRemove?: () => void;
  onConfigChange?: (config: Record<string, unknown>) => void;
}

// ─── Drill-down types ─────────────────────────────────────────────────────────

const DRILL_DOWN_CAPABLE = new Set(['kpi', 'table', 'financial_summary', 'inventory_summary', 'alert_list']);
const MAX_DRILL_DEPTH = 3;

// ─── Inline styles using glass-ui tokens ──────────────────────────────────────

const containerStyle: React.CSSProperties = {
  background: 'var(--surface-base)',
  backdropFilter: 'var(--blur-panel)',
  WebkitBackdropFilter: 'var(--blur-panel)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  position: 'relative',
  overflow: 'hidden',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--font-l3-size)',
  fontWeight: 'var(--font-l3-weight)' as React.CSSProperties['fontWeight'],
  color: 'var(--brand-text)',
  margin: 0,
};

const errorStyle: React.CSSProperties = {
  fontSize: 'var(--font-l4-size)',
  color: 'var(--status-error)',
  padding: 'var(--space-4)',
  textAlign: 'center',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
};

const removeBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--brand-text-muted)',
  cursor: 'pointer',
  padding: '2px var(--space-1)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--font-l5-size)',
};

const drillBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--brand-accent)',
  cursor: 'pointer',
  fontSize: 'var(--font-l5-size)',
  padding: 'var(--space-1) var(--space-2)',
  marginTop: 'var(--space-2)',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Widget({
  widgetId,
  widgetTypeId,
  config,
  dataSourceRef,
  lastFetchedAt,
  errorState,
  refreshOverrideSeconds,
  position,
  dashboardRefreshPolicy = 300,
  onRemove,
  onConfigChange,
}: WidgetProps) {
  const typeDef = WIDGET_REGISTRY[widgetTypeId];
  const [drillDepth, setDrillDepth] = useState(0);
  const [liveLastFetched, setLiveLastFetched] = useState<Date | null>(lastFetchedAt);
  const [liveErrorState, setLiveErrorState] = useState<string | null>(errorState);

  // Update when props change
  useEffect(() => {
    setLiveLastFetched(lastFetchedAt);
    setLiveErrorState(errorState);
  }, [lastFetchedAt, errorState]);

  // ── Scheduled refresh ──────────────────────────────────────────────────────
  const intervalSeconds = refreshOverrideSeconds ?? dashboardRefreshPolicy;

  const fetchData = useCallback(async () => {
    if (!dataSourceRef) return;
    try {
      const res = await fetch(`/api/v1/connectors/installations/${dataSourceRef}/data?widgetId=${encodeURIComponent(widgetId)}`);
      if (!res.ok) {
        setLiveErrorState(`HTTP ${res.status}`);
        return;
      }
      setLiveLastFetched(new Date());
      setLiveErrorState(null);
    } catch (err) {
      setLiveErrorState(err instanceof Error ? err.message : 'Fetch error');
    }
  }, [dataSourceRef, widgetId]);

  useEffect(() => {
    if (!dataSourceRef) return;
    const id = setInterval(fetchData, intervalSeconds * 1000);
    return () => clearInterval(id); // cleared on unmount per Req 5.5
  }, [fetchData, intervalSeconds, dataSourceRef]);

  // ── Unknown widget type ────────────────────────────────────────────────────
  if (!typeDef) {
    return (
      <article
        style={containerStyle}
        aria-label={`Unknown widget type: ${widgetTypeId}`}
      >
        <p style={errorStyle} role="alert">
          Unknown widget type: <code>{widgetTypeId}</code>
        </p>
      </article>
    );
  }

  const hasDrillDown = DRILL_DOWN_CAPABLE.has(widgetTypeId) && typeDef.supportsDrillDown;
  const canDrillDeeper = drillDepth < MAX_DRILL_DEPTH;
  const displayName = (config['title'] as string | undefined) ?? typeDef.displayName;

  return (
    <article
      style={containerStyle}
      aria-label={`${displayName} widget`}
    >
      {/* Header */}
      <div style={headerStyle}>
        <h3 style={titleStyle}>{displayName}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <FreshnessIndicator
            lastFetchedAt={liveLastFetched}
            errorState={liveErrorState}
          />
          {onRemove && (
            <button
              style={removeBtn}
              onClick={onRemove}
              aria-label={`Remove ${displayName} widget`}
              title="Remove widget"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Error state — show with staleness info per Req 4.6 */}
      {liveErrorState && (
        <div role="alert" style={{ color: 'var(--status-error)', fontSize: 'var(--font-l5-size)' }}>
          ⚠ {liveErrorState}
        </div>
      )}

      {/* Widget body placeholder — real renderers per widget type to be added per widget family */}
      {!liveErrorState && (
        <div
          aria-label={`${displayName} data`}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-text-muted)',
            fontSize: 'var(--font-l4-size)',
            minHeight: 60,
          }}
        >
          {/* Screen-reader accessible alternative for charts (Req 11.2) */}
          {['line_chart', 'bar_chart', 'area_chart', 'pie_chart', 'donut_chart', 'gauge'].includes(widgetTypeId) && (
            <table aria-hidden="false" className="srOnly">
              <caption>{displayName} — data table</caption>
              <tbody>
                <tr>
                  <td>No data rendered yet — connect a data source.</td>
                </tr>
              </tbody>
            </table>
          )}
          <span aria-hidden="true">
            [{typeDef.family}]
          </span>
        </div>
      )}

      {/* Drill-down affordance (Req 4.7) */}
      {hasDrillDown && !liveErrorState && (
        <div>
          {drillDepth < MAX_DRILL_DEPTH ? (
            <button
              style={drillBtn}
              onClick={() => setDrillDepth((d) => Math.min(d + 1, MAX_DRILL_DEPTH))}
              aria-label={`Drill down into ${displayName} — level ${drillDepth + 1} of ${MAX_DRILL_DEPTH}`}
            >
              ↓ Drill down {drillDepth > 0 ? `(level ${drillDepth + 1})` : ''}
            </button>
          ) : (
            <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', margin: 0 }}>
              Source record is the terminal point.
            </p>
          )}
          {drillDepth > 0 && (
            <button
              style={{ ...drillBtn, marginLeft: 'var(--space-2)', color: 'var(--brand-text-muted)' }}
              onClick={() => setDrillDepth(0)}
              aria-label="Return to summary view"
            >
              ↑ Back to summary
            </button>
          )}
        </div>
      )}

      {/* Fallback data source indicator (Req 26.4) */}
      {dataSourceRef && !liveErrorState && (
        <div style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)' }}>
          Data from: {dataSourceRef}
        </div>
      )}
    </article>
  );
}
