'use client';

/**
 * WidgetRenderer — central dispatcher that renders the correct widget
 * component based on `widget.type`.
 *
 * Accepts both the new WidgetConfig-based API and the legacy WidgetDto API
 * for backward compatibility with existing dashboard pages.
 */

import type { WidgetDto } from '@/lib/api';
import type { WidgetType, WidgetConfig, WidgetProps } from './widget.types';

import KpiCard from './KpiCard';
import LineChartWidget from './LineChartWidget';
import BarChartWidget from './BarChartWidget';
import PieChartWidget from './PieChartWidget';
import HeatMapWidget from './HeatMapWidget';
import GaugeWidget from './GaugeWidget';
import SparklineWidget from './SparklineWidget';
import TableWidget from './TableWidget';
import RadarWidget from './RadarWidget';
import ScatterWidget from './ScatterWidget';
import TreemapWidget from './TreemapWidget';
import WaterfallWidget from './WaterfallWidget';
import FunnelWidget from './FunnelWidget';
import BoxPlotWidget from './BoxPlotWidget';
import NetworkGraphWidget from './NetworkGraphWidget';
import SankeyWidget from './SankeyWidget';
import MapWidget from './MapWidget';
import TimelineWidget from './TimelineWidget';
import AlertListWidget from './AlertListWidget';
import AiInsightWidget from './AiInsightWidget';

// ─── Normalise type string ──────────────────────────────────────────────────

function normaliseType(raw: string): WidgetType {
  const t = raw.toLowerCase().trim() as WidgetType;
  // Map legacy short-form types to canonical names
  const aliases: Record<string, WidgetType> = {
    kpi:          'kpi_card',
    line:         'line_chart',
    bar:          'bar_chart',
    pie:          'pie_chart',
    heatmap:      'heat_map',
    gauge:        'gauge',
    gauge_legacy: 'gauge',
    scatter_plot: 'scatter',
    boxplot:      'box_plot',
    box:          'box_plot',
    alert:        'alert_list',
    alerts:       'alert_list',
    ai:           'ai_insight',
    insight:      'ai_insight',
    insights:     'ai_insight',
    network:      'network_graph',
    flow:         'sankey',
    funnel_chart: 'funnel',
  };
  return aliases[t] ?? t;
}

// ─── Legacy WidgetDto compatibility ─────────────────────────────────────────

export interface LegacyWidgetRendererProps {
  widget: WidgetDto;
  onDrillDown?: (item: unknown) => void;
  height?: number;
}

/** Renders a widget from the legacy WidgetDto (used by existing dashboard pages). */
export function WidgetDtoRenderer({ widget, onDrillDown, height }: LegacyWidgetRendererProps) {
  const config = (widget.config ?? {}) as WidgetConfig;
  const type = normaliseType(widget.type ?? 'kpi_card');
  return (
    <WidgetRenderer
      id={widget.id}
      type={type}
      config={config}
      onDrillDown={onDrillDown}
      height={height}
    />
  );
}

// ─── Main WidgetRenderer ──────────────────────────────────────────────────────

export interface WidgetRendererProps extends WidgetProps {
  type: WidgetType | string;
}

/**
 * Switch dispatcher — choose and render the correct widget component.
 *
 * All widgets receive:
 *   id          — stable identifier for seed / key
 *   config      — visualization configuration
 *   onDrillDown — optional drill-down callback
 *   height      — pixel height of the widget content area
 */
export default function WidgetRenderer({ id, type: rawType, config, onDrillDown, height = 180 }: WidgetRendererProps) {
  const type = normaliseType(String(rawType ?? 'kpi_card'));
  const props: WidgetProps = { id, config, onDrillDown, height };

  switch (type) {
    case 'kpi_card':
    case 'kpi':
      return <KpiCard {...props} />;

    case 'line_chart':
    case 'line':
      return <LineChartWidget {...props} />;

    case 'bar_chart':
    case 'bar':
      return <BarChartWidget {...props} />;

    case 'pie_chart':
    case 'pie':
      return <PieChartWidget {...props} />;

    case 'heat_map':
    case 'heatmap':
      return <HeatMapWidget {...props} />;

    case 'gauge':
    case 'gauge_legacy':
      return <GaugeWidget {...props} />;

    case 'sparkline':
      return <SparklineWidget {...props} />;

    case 'table':
      return <TableWidget {...props} />;

    case 'radar':
      return <RadarWidget {...props} />;

    case 'scatter':
      return <ScatterWidget {...props} />;

    case 'treemap':
      return <TreemapWidget {...props} />;

    case 'waterfall':
      return <WaterfallWidget {...props} />;

    case 'funnel':
      return <FunnelWidget {...props} />;

    case 'box_plot':
      return <BoxPlotWidget {...props} />;

    case 'network_graph':
      return <NetworkGraphWidget {...props} />;

    case 'sankey':
      return <SankeyWidget {...props} />;

    case 'map':
      return <MapWidget {...props} />;

    case 'timeline':
      return <TimelineWidget {...props} />;

    case 'alert_list':
      return <AlertListWidget {...props} />;

    case 'ai_insight':
      return <AiInsightWidget {...props} />;

    default:
      return (
        <div
          style={{
            height,
            display: 'grid',
            placeItems: 'center',
            color: '#8b95a8',
            fontSize: 12,
            textAlign: 'center',
            padding: '0 12px',
          }}
          aria-label={`Unknown widget type: ${rawType}`}
        >
          <span>Widget type &ldquo;{rawType}&rdquo; is not supported.</span>
        </div>
      );
  }
}
