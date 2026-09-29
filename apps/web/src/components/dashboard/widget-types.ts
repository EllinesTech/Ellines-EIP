/**
 * Dashboard Widget Types — Task 18.1
 *
 * 20 widget type exports used by the widget library and DashboardGrid.
 * This file is the canonical source of all widget-type identifiers for the
 * dashboard infrastructure. It re-exports the shared WidgetType union from
 * the widgets library and adds dashboard-specific metadata.
 *
 * Requirements 20.x: Dashboard Infrastructure
 */

// ─── Widget type identifiers ───────────────────────────────────────────────────
// These must stay in sync with components/widgets/widget.types.ts

export const WIDGET_TYPES = [
  'kpi_card',
  'line_chart',
  'bar_chart',
  'pie_chart',
  'heat_map',
  'network_graph',
  'sankey',
  'gauge',
  'sparkline',
  'table',
  'map',
  'timeline',
  'radar',
  'waterfall',
  'funnel',
  'scatter',
  'box_plot',
  'treemap',
  'ai_insight',
  'alert_list',
] as const;

export type DashboardWidgetType = (typeof WIDGET_TYPES)[number];

// ─── Widget catalogue (name + default size) ────────────────────────────────────

export interface WidgetCatalogEntry {
  type: DashboardWidgetType;
  label: string;
  description: string;
  /** Default grid width (columns) */
  defaultW: number;
  /** Default grid height (rows) */
  defaultH: number;
  category: 'kpi' | 'chart' | 'data' | 'ai' | 'map';
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  {
    type: 'kpi_card',
    label: 'KPI Card',
    description: 'Single metric with trend indicator.',
    defaultW: 2,
    defaultH: 2,
    category: 'kpi',
  },
  {
    type: 'line_chart',
    label: 'Line Chart',
    description: 'Time-series or category trend line.',
    defaultW: 4,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'bar_chart',
    label: 'Bar Chart',
    description: 'Comparative bar or grouped bar.',
    defaultW: 4,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'pie_chart',
    label: 'Pie / Donut Chart',
    description: 'Proportional breakdown.',
    defaultW: 3,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'heat_map',
    label: 'Heat Map',
    description: '2D density / intensity matrix.',
    defaultW: 4,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'network_graph',
    label: 'Network Graph',
    description: 'Node-link diagram for relationships.',
    defaultW: 4,
    defaultH: 4,
    category: 'data',
  },
  {
    type: 'sankey',
    label: 'Sankey Diagram',
    description: 'Flow / pipeline visualisation.',
    defaultW: 6,
    defaultH: 4,
    category: 'chart',
  },
  {
    type: 'gauge',
    label: 'Gauge',
    description: 'Progress towards a target or threshold.',
    defaultW: 2,
    defaultH: 2,
    category: 'kpi',
  },
  {
    type: 'sparkline',
    label: 'Sparkline',
    description: 'Compact inline trend line.',
    defaultW: 2,
    defaultH: 2,
    category: 'kpi',
  },
  {
    type: 'table',
    label: 'Data Table',
    description: 'Tabular data with optional sorting.',
    defaultW: 6,
    defaultH: 4,
    category: 'data',
  },
  {
    type: 'map',
    label: 'Map',
    description: 'Geographic pin map.',
    defaultW: 4,
    defaultH: 4,
    category: 'map',
  },
  {
    type: 'timeline',
    label: 'Timeline',
    description: 'Chronological event stream.',
    defaultW: 4,
    defaultH: 3,
    category: 'data',
  },
  {
    type: 'radar',
    label: 'Radar / Spider Chart',
    description: 'Multi-axis comparison.',
    defaultW: 3,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'waterfall',
    label: 'Waterfall Chart',
    description: 'Cumulative gain/loss breakdown.',
    defaultW: 4,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'funnel',
    label: 'Funnel Chart',
    description: 'Stage-by-stage conversion funnel.',
    defaultW: 3,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'scatter',
    label: 'Scatter Plot',
    description: 'Correlation across two metrics.',
    defaultW: 4,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'box_plot',
    label: 'Box Plot',
    description: 'Statistical distribution summary.',
    defaultW: 4,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'treemap',
    label: 'Treemap',
    description: 'Hierarchical proportional area.',
    defaultW: 4,
    defaultH: 3,
    category: 'chart',
  },
  {
    type: 'ai_insight',
    label: 'AI Insight',
    description: 'Ellinea AI-generated recommendations.',
    defaultW: 4,
    defaultH: 3,
    category: 'ai',
  },
  {
    type: 'alert_list',
    label: 'Alert List',
    description: 'Live alert feed with severity badges.',
    defaultW: 3,
    defaultH: 3,
    category: 'data',
  },
];

/** Quick lookup: type → catalogue entry */
export const WIDGET_CATALOG_MAP: Record<DashboardWidgetType, WidgetCatalogEntry> =
  Object.fromEntries(WIDGET_CATALOG.map((e) => [e.type, e])) as Record<
    DashboardWidgetType,
    WidgetCatalogEntry
  >;
