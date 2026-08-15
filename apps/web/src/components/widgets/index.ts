/**
 * Widget Library — Barrel Export
 *
 * Re-exports all 20+ widget components and shared types for easy import.
 * Usage: import { KpiCard, LineChartWidget, WidgetRenderer } from '@/components/widgets';
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  WidgetType,
  WidgetProps,
  WidgetConfig,
  DataPoint,
  ScatterPoint,
  Severity,
  AlertEntry,
  MapPin,
  TimelineEvent,
  NetworkNode,
  NetworkEdge,
  SankeyNode,
  SankeyLink,
  AiInsight,
  BoxPlotStats,
  RadarAxis,
  FunnelStep,
  WaterfallSegment,
  TreemapLeaf,
  TrendDirection,
} from './widget.types';

// ─── Widget Components ────────────────────────────────────────────────────────
export { default as KpiCard } from './KpiCard';
export { default as LineChartWidget } from './LineChartWidget';
export { default as BarChartWidget } from './BarChartWidget';
export { default as PieChartWidget } from './PieChartWidget';
export { default as HeatMapWidget } from './HeatMapWidget';
export { default as NetworkGraphWidget } from './NetworkGraphWidget';
export { default as SankeyWidget } from './SankeyWidget';
export { default as GaugeWidget } from './GaugeWidget';
export { default as SparklineWidget } from './SparklineWidget';
export { default as TableWidget } from './TableWidget';
export { default as MapWidget } from './MapWidget';
export { default as TimelineWidget } from './TimelineWidget';
export { default as RadarWidget } from './RadarWidget';
export { default as WaterfallWidget } from './WaterfallWidget';
export { default as FunnelWidget } from './FunnelWidget';
export { default as ScatterWidget } from './ScatterWidget';
export { default as BoxPlotWidget } from './BoxPlotWidget';
export { default as TreemapWidget } from './TreemapWidget';
export { default as AiInsightWidget } from './AiInsightWidget';
export { default as AlertListWidget } from './AlertListWidget';

// ─── Widget Renderer ─────────────────────────────────────────────────────────
export { default as WidgetRenderer, WidgetDtoRenderer } from './WidgetRenderer';
export type { WidgetRendererProps, LegacyWidgetRendererProps } from './WidgetRenderer';
