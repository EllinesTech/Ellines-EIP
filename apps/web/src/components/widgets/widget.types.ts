/**
 * Widget Library — Types
 * Shared type definitions for all 20+ widget visualization types.
 */

export type WidgetType =
  | 'kpi_card'
  | 'line_chart'
  | 'bar_chart'
  | 'pie_chart'
  | 'heat_map'
  | 'network_graph'
  | 'sankey'
  | 'gauge'
  | 'sparkline'
  | 'table'
  | 'map'
  | 'timeline'
  | 'radar'
  | 'waterfall'
  | 'funnel'
  | 'scatter'
  | 'box_plot'
  | 'treemap'
  | 'ai_insight'
  | 'alert_list'
  // legacy short aliases kept for backward compat
  | 'kpi'
  | 'line'
  | 'bar'
  | 'pie'
  | 'heatmap'
  | 'gauge_legacy';

/** A generic { name, value } data point used by most chart widgets. */
export interface DataPoint {
  name: string;
  value: number;
  [key: string]: unknown;
}

/** Two-axis scatter point. */
export interface ScatterPoint {
  x: number;
  y: number;
  name?: string;
  [key: string]: unknown;
}

/** Alert severity levels. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A single alert entry for the alert_list widget. */
export interface AlertEntry {
  id: string;
  title: string;
  message?: string;
  severity: Severity;
  timestamp?: string;
  source?: string;
  acknowledged?: boolean;
}

/** A map pin / location marker. */
export interface MapPin {
  id: string;
  label: string;
  lat: number;
  lng: number;
  status?: 'ok' | 'warn' | 'error';
}

/** A timeline event. */
export interface TimelineEvent {
  id: string;
  label: string;
  timestamp: string;
  description?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

/** A network graph node. */
export interface NetworkNode {
  id: string;
  label: string;
  type?: string;
  status?: 'ok' | 'warn' | 'error';
}

/** A network graph edge. */
export interface NetworkEdge {
  from: string;
  to: string;
  label?: string;
  weight?: number;
}

/** Sankey node. */
export interface SankeyNode {
  id: string;
  label: string;
  color?: string;
}

/** Sankey flow/link. */
export interface SankeyLink {
  from: string;
  to: string;
  value: number;
}

/** AI Insight recommendation. */
export interface AiInsight {
  id: string;
  title: string;
  body: string;
  confidence: number; // 0-100
  category?: string;
  actions?: string[];
  timestamp?: string;
}

/** Box plot statistics. */
export interface BoxPlotStats {
  name: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers?: number[];
}

/** Radar axis. */
export interface RadarAxis {
  subject: string;
  value: number;
  fullMark?: number;
}

/** Funnel step. */
export interface FunnelStep {
  name: string;
  value: number;
  percent?: number;
}

/** Waterfall segment. */
export interface WaterfallSegment {
  name: string;
  value: number; // positive = gain, negative = loss
}

/** Treemap leaf (recharts compatible). */
export interface TreemapLeaf {
  name: string;
  size: number;
  color?: string;
  children?: TreemapLeaf[];
}

/** KPI trend direction. */
export type TrendDirection = 'up' | 'down' | 'flat';

/**
 * Flexible widget configuration bag.
 * Each widget reads only the keys it needs.
 */
export interface WidgetConfig {
  // KPI
  value?: number | string;
  unit?: string;
  delta?: number | string;
  deltaLabel?: string;
  trend?: TrendDirection;
  sparklineData?: DataPoint[];

  // Generic chart data
  data?: DataPoint[] | ScatterPoint[] | BoxPlotStats[] | RadarAxis[] | FunnelStep[] | WaterfallSegment[] | TreemapLeaf[];
  series?: { name: string; data: DataPoint[]; color?: string }[];

  // Gauge
  min?: number;
  max?: number;
  thresholds?: { value: number; color: string }[];

  // Network
  nodes?: NetworkNode[];
  edges?: NetworkEdge[];

  // Sankey
  sankeyNodes?: SankeyNode[];
  sankeyLinks?: SankeyLink[];

  // Map
  pins?: MapPin[];
  centerLat?: number;
  centerLng?: number;

  // Timeline
  events?: TimelineEvent[];

  // Alert list
  alerts?: AlertEntry[];

  // AI Insight
  insights?: AiInsight[];

  // Table
  columns?: { key: string; label: string; width?: string }[];
  rows?: Record<string, unknown>[];

  // Heatmap
  rows_count?: number;
  cols_count?: number;

  // Display
  colorScheme?: string;
  showLegend?: boolean;
  showGrid?: boolean;
  height?: number;

  // Allow arbitrary extra config without losing type safety
  [key: string]: unknown;
}

/** Props accepted by every widget component. */
export interface WidgetProps {
  /** Widget identifier (used for stable key/seed). */
  id: string;
  /** Widget title (displayed by the shell, not the widget itself). */
  title?: string;
  /** Configuration object — shape varies by widget type. */
  config?: WidgetConfig;
  /** Optional drill-down callback invoked when user clicks a data point. */
  onDrillDown?: (item: unknown) => void;
  /** Pixel height of the widget content area. Defaults to 180. */
  height?: number;
}
