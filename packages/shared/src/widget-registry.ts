/**
 * Ellines EIP — Widget Registry
 *
 * Defines all 24 widget type definitions. Each widgetTypeId is snake_case,
 * ≤ 64 characters, and immutable once published.
 *
 * Requirements: 4.1, 4.2, 27.1
 */

export type WidgetFamily =
  | 'KPI'
  | 'Metric'
  | 'Trend'
  | 'LineChart'
  | 'BarChart'
  | 'AreaChart'
  | 'PieChart'
  | 'DonutChart'
  | 'Gauge'
  | 'Table'
  | 'Ranking'
  | 'Status'
  | 'Timeline'
  | 'ActivityFeed'
  | 'AlertList'
  | 'ApprovalList'
  | 'TaskList'
  | 'ConnectorHealth'
  | 'SystemHealth'
  | 'ReportEmbed'
  | 'EllineaInsight'
  | 'Comparison'
  | 'FinancialSummary'
  | 'InventorySummary';

export interface WidgetTypeDef {
  /** Immutable identifier — snake_case, ≤ 64 chars. */
  widgetTypeId: string;
  displayName: string;
  family: WidgetFamily;
  supportsDrillDown: boolean;
  defaultWidth: number;
  defaultHeight: number;
  /** JSON Schema for validating the widget's `config` field. */
  configSchema: Record<string, unknown>;
}

export const WIDGET_REGISTRY: Record<string, WidgetTypeDef> = {
  // ── KPI ──────────────────────────────────────────────────────────────────
  kpi: {
    widgetTypeId: 'kpi',
    displayName: 'KPI',
    family: 'KPI',
    supportsDrillDown: true,
    defaultWidth: 3,
    defaultHeight: 2,
    configSchema: {
      type: 'object',
      required: ['metricKey', 'label'],
      properties: {
        metricKey: { type: 'string', description: 'Data source metric identifier' },
        label: { type: 'string', maxLength: 80 },
        unit: { type: 'string', maxLength: 20 },
        comparisonMode: {
          type: 'string',
          enum: ['none', 'period_over_period', 'target'],
          default: 'none',
        },
        target: { type: 'number' },
        invertTrend: {
          type: 'boolean',
          default: false,
          description: 'When true, a decrease is considered positive (e.g. expenses).',
        },
      },
      additionalProperties: false,
    },
  },

  // ── Metric ───────────────────────────────────────────────────────────────
  metric: {
    widgetTypeId: 'metric',
    displayName: 'Metric',
    family: 'Metric',
    supportsDrillDown: false,
    defaultWidth: 2,
    defaultHeight: 2,
    configSchema: {
      type: 'object',
      required: ['metricKey', 'label'],
      properties: {
        metricKey: { type: 'string' },
        label: { type: 'string', maxLength: 80 },
        unit: { type: 'string', maxLength: 20 },
        format: {
          type: 'string',
          enum: ['number', 'currency', 'percentage', 'duration'],
          default: 'number',
        },
        decimalPlaces: { type: 'integer', minimum: 0, maximum: 4, default: 0 },
      },
      additionalProperties: false,
    },
  },

  // ── Trend ────────────────────────────────────────────────────────────────
  trend: {
    widgetTypeId: 'trend',
    displayName: 'Trend',
    family: 'Trend',
    supportsDrillDown: false,
    defaultWidth: 4,
    defaultHeight: 2,
    configSchema: {
      type: 'object',
      required: ['metricKey', 'label'],
      properties: {
        metricKey: { type: 'string' },
        label: { type: 'string', maxLength: 80 },
        period: {
          type: 'string',
          enum: ['7d', '30d', '90d', '12m'],
          default: '30d',
        },
        showSparkline: { type: 'boolean', default: true },
        unit: { type: 'string', maxLength: 20 },
      },
      additionalProperties: false,
    },
  },

  // ── LineChart ─────────────────────────────────────────────────────────────
  line_chart: {
    widgetTypeId: 'line_chart',
    displayName: 'Line Chart',
    family: 'LineChart',
    supportsDrillDown: false,
    defaultWidth: 6,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['seriesKeys', 'xAxisKey'],
      properties: {
        seriesKeys: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 6,
        },
        xAxisKey: { type: 'string' },
        title: { type: 'string', maxLength: 100 },
        yAxisLabel: { type: 'string', maxLength: 60 },
        smoothCurve: { type: 'boolean', default: false },
        showLegend: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── BarChart ──────────────────────────────────────────────────────────────
  bar_chart: {
    widgetTypeId: 'bar_chart',
    displayName: 'Bar Chart',
    family: 'BarChart',
    supportsDrillDown: false,
    defaultWidth: 6,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['categoryKey', 'valueKeys'],
      properties: {
        categoryKey: { type: 'string' },
        valueKeys: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 6,
        },
        title: { type: 'string', maxLength: 100 },
        orientation: { type: 'string', enum: ['vertical', 'horizontal'], default: 'vertical' },
        stacked: { type: 'boolean', default: false },
        showLegend: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── AreaChart ─────────────────────────────────────────────────────────────
  area_chart: {
    widgetTypeId: 'area_chart',
    displayName: 'Area Chart',
    family: 'AreaChart',
    supportsDrillDown: false,
    defaultWidth: 6,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['seriesKeys', 'xAxisKey'],
      properties: {
        seriesKeys: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 4,
        },
        xAxisKey: { type: 'string' },
        title: { type: 'string', maxLength: 100 },
        stacked: { type: 'boolean', default: false },
        fillOpacity: { type: 'number', minimum: 0, maximum: 1, default: 0.3 },
      },
      additionalProperties: false,
    },
  },

  // ── PieChart ──────────────────────────────────────────────────────────────
  pie_chart: {
    widgetTypeId: 'pie_chart',
    displayName: 'Pie Chart',
    family: 'PieChart',
    supportsDrillDown: false,
    defaultWidth: 4,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['categoryKey', 'valueKey'],
      properties: {
        categoryKey: { type: 'string' },
        valueKey: { type: 'string' },
        title: { type: 'string', maxLength: 100 },
        maxSlices: { type: 'integer', minimum: 2, maximum: 12, default: 8 },
        showLegend: { type: 'boolean', default: true },
        showLabels: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── DonutChart ────────────────────────────────────────────────────────────
  donut_chart: {
    widgetTypeId: 'donut_chart',
    displayName: 'Donut Chart',
    family: 'DonutChart',
    supportsDrillDown: false,
    defaultWidth: 4,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['categoryKey', 'valueKey'],
      properties: {
        categoryKey: { type: 'string' },
        valueKey: { type: 'string' },
        title: { type: 'string', maxLength: 100 },
        centerLabel: { type: 'string', maxLength: 40 },
        maxSlices: { type: 'integer', minimum: 2, maximum: 12, default: 8 },
        showLegend: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── Gauge ─────────────────────────────────────────────────────────────────
  gauge: {
    widgetTypeId: 'gauge',
    displayName: 'Gauge',
    family: 'Gauge',
    supportsDrillDown: false,
    defaultWidth: 3,
    defaultHeight: 3,
    configSchema: {
      type: 'object',
      required: ['metricKey', 'label', 'min', 'max'],
      properties: {
        metricKey: { type: 'string' },
        label: { type: 'string', maxLength: 80 },
        min: { type: 'number' },
        max: { type: 'number' },
        unit: { type: 'string', maxLength: 20 },
        thresholds: {
          type: 'array',
          description: 'Up to 3 color thresholds: [{value, color}]',
          items: {
            type: 'object',
            required: ['value', 'color'],
            properties: {
              value: { type: 'number' },
              color: { type: 'string', enum: ['green', 'yellow', 'red'] },
            },
          },
          maxItems: 3,
        },
      },
      additionalProperties: false,
    },
  },

  // ── Table ─────────────────────────────────────────────────────────────────
  table: {
    widgetTypeId: 'table',
    displayName: 'Table',
    family: 'Table',
    supportsDrillDown: true,
    defaultWidth: 8,
    defaultHeight: 5,
    configSchema: {
      type: 'object',
      required: ['entity', 'columns'],
      properties: {
        entity: { type: 'string', description: 'UEM entity type (e.g. Invoice, Customer)' },
        columns: {
          type: 'array',
          items: {
            type: 'object',
            required: ['field', 'header'],
            properties: {
              field: { type: 'string' },
              header: { type: 'string', maxLength: 60 },
              sortable: { type: 'boolean', default: true },
              width: { type: 'string', maxLength: 12 },
            },
          },
          minItems: 1,
          maxItems: 20,
        },
        pageSize: { type: 'integer', minimum: 5, maximum: 100, default: 20 },
        defaultSort: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            direction: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        },
        filterable: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── Ranking ───────────────────────────────────────────────────────────────
  ranking: {
    widgetTypeId: 'ranking',
    displayName: 'Ranking',
    family: 'Ranking',
    supportsDrillDown: false,
    defaultWidth: 4,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['entity', 'rankBy', 'labelField'],
      properties: {
        entity: { type: 'string' },
        rankBy: { type: 'string', description: 'Numeric field to rank by' },
        labelField: { type: 'string', description: 'Display label field' },
        limit: { type: 'integer', minimum: 3, maximum: 20, default: 10 },
        order: { type: 'string', enum: ['desc', 'asc'], default: 'desc' },
        unit: { type: 'string', maxLength: 20 },
        title: { type: 'string', maxLength: 100 },
      },
      additionalProperties: false,
    },
  },

  // ── Status ────────────────────────────────────────────────────────────────
  status: {
    widgetTypeId: 'status',
    displayName: 'Status',
    family: 'Status',
    supportsDrillDown: false,
    defaultWidth: 3,
    defaultHeight: 2,
    configSchema: {
      type: 'object',
      required: ['statusKey', 'label'],
      properties: {
        statusKey: { type: 'string', description: 'Field or metric to evaluate for status' },
        label: { type: 'string', maxLength: 80 },
        statusMap: {
          type: 'object',
          description: 'Map of raw value → display label',
          additionalProperties: { type: 'string' },
        },
        showTimestamp: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── Timeline ──────────────────────────────────────────────────────────────
  timeline: {
    widgetTypeId: 'timeline',
    displayName: 'Timeline',
    family: 'Timeline',
    supportsDrillDown: false,
    defaultWidth: 6,
    defaultHeight: 5,
    configSchema: {
      type: 'object',
      required: ['entity', 'timestampField', 'labelField'],
      properties: {
        entity: { type: 'string' },
        timestampField: { type: 'string' },
        labelField: { type: 'string' },
        descriptionField: { type: 'string' },
        limit: { type: 'integer', minimum: 5, maximum: 100, default: 20 },
        groupByDay: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── ActivityFeed ──────────────────────────────────────────────────────────
  activity_feed: {
    widgetTypeId: 'activity_feed',
    displayName: 'Activity Feed',
    family: 'ActivityFeed',
    supportsDrillDown: false,
    defaultWidth: 4,
    defaultHeight: 5,
    configSchema: {
      type: 'object',
      required: ['sources'],
      properties: {
        sources: {
          type: 'array',
          items: {
            type: 'string',
            description: 'Connector or entity type to include in feed',
          },
          minItems: 1,
          maxItems: 6,
        },
        limit: { type: 'integer', minimum: 5, maximum: 50, default: 20 },
        showActor: { type: 'boolean', default: true },
        showEntityType: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── AlertList ─────────────────────────────────────────────────────────────
  alert_list: {
    widgetTypeId: 'alert_list',
    displayName: 'Alert List',
    family: 'AlertList',
    supportsDrillDown: true,
    defaultWidth: 6,
    defaultHeight: 5,
    configSchema: {
      type: 'object',
      properties: {
        severities: {
          type: 'array',
          items: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          default: ['critical', 'high'],
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific alert categories; empty = all',
          default: [],
        },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        showDismissed: { type: 'boolean', default: false },
      },
      additionalProperties: false,
    },
  },

  // ── ApprovalList ──────────────────────────────────────────────────────────
  approval_list: {
    widgetTypeId: 'approval_list',
    displayName: 'Approval List',
    family: 'ApprovalList',
    supportsDrillDown: false,
    defaultWidth: 6,
    defaultHeight: 5,
    configSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['mine', 'team', 'organization'],
          default: 'mine',
          description: 'Whose approvals to show',
        },
        statuses: {
          type: 'array',
          items: { type: 'string', enum: ['pending', 'approved', 'rejected', 'escalated'] },
          default: ['pending'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        showOverdueOnly: { type: 'boolean', default: false },
      },
      additionalProperties: false,
    },
  },

  // ── TaskList ──────────────────────────────────────────────────────────────
  task_list: {
    widgetTypeId: 'task_list',
    displayName: 'Task List',
    family: 'TaskList',
    supportsDrillDown: false,
    defaultWidth: 5,
    defaultHeight: 5,
    configSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['mine', 'team', 'organization'],
          default: 'mine',
        },
        statuses: {
          type: 'array',
          items: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done'] },
          default: ['todo', 'in_progress'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 },
        showDueSoon: { type: 'boolean', default: true },
        dueSoonHours: { type: 'integer', minimum: 1, maximum: 168, default: 24 },
      },
      additionalProperties: false,
    },
  },

  // ── ConnectorHealth ───────────────────────────────────────────────────────
  connector_health: {
    widgetTypeId: 'connector_health',
    displayName: 'Connector Health',
    family: 'ConnectorHealth',
    supportsDrillDown: false,
    defaultWidth: 4,
    defaultHeight: 3,
    configSchema: {
      type: 'object',
      properties: {
        connectorIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific connector IDs to monitor; empty = all org connectors',
          default: [],
        },
        showLatency: { type: 'boolean', default: true },
        showLastSync: { type: 'boolean', default: true },
        showErrorCount: { type: 'boolean', default: true },
        alertOnDegraded: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── SystemHealth ──────────────────────────────────────────────────────────
  system_health: {
    widgetTypeId: 'system_health',
    displayName: 'System Health',
    family: 'SystemHealth',
    supportsDrillDown: false,
    defaultWidth: 4,
    defaultHeight: 3,
    configSchema: {
      type: 'object',
      properties: {
        includeConnectorHealth: { type: 'boolean', default: true },
        includeApiHealth: { type: 'boolean', default: true },
        includeQueueHealth: { type: 'boolean', default: false },
        showOverallScore: { type: 'boolean', default: true },
        scoreThresholdWarning: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          default: 70,
          description: 'Score below this value triggers a warning state',
        },
      },
      additionalProperties: false,
    },
  },

  // ── ReportEmbed ───────────────────────────────────────────────────────────
  report_embed: {
    widgetTypeId: 'report_embed',
    displayName: 'Report Embed',
    family: 'ReportEmbed',
    supportsDrillDown: false,
    defaultWidth: 8,
    defaultHeight: 6,
    configSchema: {
      type: 'object',
      required: ['reportId'],
      properties: {
        reportId: { type: 'string', description: 'ID of a saved EIP report' },
        title: { type: 'string', maxLength: 100 },
        showHeader: { type: 'boolean', default: true },
        showExportButton: { type: 'boolean', default: true },
        autoRefresh: { type: 'boolean', default: false },
      },
      additionalProperties: false,
    },
  },

  // ── EllineaInsight ────────────────────────────────────────────────────────
  ellinea_insight: {
    widgetTypeId: 'ellinea_insight',
    displayName: 'Ellinea Insight',
    family: 'EllineaInsight',
    supportsDrillDown: false,
    defaultWidth: 6,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['insightPrompt'],
      properties: {
        insightPrompt: {
          type: 'string',
          maxLength: 500,
          description: 'The standing question Ellinea answers on each refresh',
        },
        dataSources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Connector IDs or UEM entity types to restrict evidence to',
          default: [],
        },
        maxEvidenceAge: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d'],
          default: '24h',
          description: 'Refuse to answer if all evidence is older than this threshold',
        },
        showEvidenceLinks: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── Comparison ────────────────────────────────────────────────────────────
  comparison: {
    widgetTypeId: 'comparison',
    displayName: 'Comparison',
    family: 'Comparison',
    supportsDrillDown: false,
    defaultWidth: 6,
    defaultHeight: 3,
    configSchema: {
      type: 'object',
      required: ['metricKey', 'label'],
      properties: {
        metricKey: { type: 'string' },
        label: { type: 'string', maxLength: 80 },
        periods: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year'],
          },
          minItems: 2,
          maxItems: 4,
          default: ['this_month', 'last_month'],
        },
        unit: { type: 'string', maxLength: 20 },
        showPercentChange: { type: 'boolean', default: true },
        invertTrend: { type: 'boolean', default: false },
      },
      additionalProperties: false,
    },
  },

  // ── FinancialSummary ──────────────────────────────────────────────────────
  financial_summary: {
    widgetTypeId: 'financial_summary',
    displayName: 'Financial Summary',
    family: 'FinancialSummary',
    supportsDrillDown: true,
    defaultWidth: 6,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['period'],
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'last_month', 'last_year'],
          default: 'this_month',
        },
        metrics: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['revenue', 'expenses', 'profit', 'gross_margin', 'receivables', 'payables', 'cash_position'],
          },
          default: ['revenue', 'expenses', 'profit'],
          description: 'Metrics visible in this widget; role enforcement applied server-side',
        },
        currency: { type: 'string', maxLength: 3, default: 'KES' },
        showTrend: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },

  // ── InventorySummary ──────────────────────────────────────────────────────
  inventory_summary: {
    widgetTypeId: 'inventory_summary',
    displayName: 'Inventory Summary',
    family: 'InventorySummary',
    supportsDrillDown: true,
    defaultWidth: 6,
    defaultHeight: 4,
    configSchema: {
      type: 'object',
      required: ['warehouseScope'],
      properties: {
        warehouseScope: {
          type: 'string',
          enum: ['all', 'branch', 'specific'],
          default: 'all',
        },
        warehouseIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required when warehouseScope = "specific"',
          default: [],
        },
        metrics: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['total_sku_count', 'low_stock_count', 'out_of_stock_count', 'total_value', 'reorder_pending'],
          },
          default: ['total_sku_count', 'low_stock_count', 'out_of_stock_count'],
        },
        lowStockThreshold: {
          type: 'integer',
          minimum: 1,
          default: 10,
          description: 'Quantity at or below which a SKU is considered low-stock',
        },
      },
      additionalProperties: false,
    },
  },
};

/** All valid widget type IDs derived from the registry. */
export const WIDGET_TYPE_IDS = Object.keys(WIDGET_REGISTRY) as Array<keyof typeof WIDGET_REGISTRY>;

/**
 * Look up a widget type definition by its ID.
 * Returns `undefined` for unknown types — callers must render an error placeholder.
 */
export function getWidgetTypeDef(widgetTypeId: string): WidgetTypeDef | undefined {
  return WIDGET_REGISTRY[widgetTypeId];
}

/**
 * Returns true if the given widgetTypeId supports drill-down navigation.
 * Safe to call with unknown IDs — returns false.
 */
export function widgetSupportsDrillDown(widgetTypeId: string): boolean {
  return WIDGET_REGISTRY[widgetTypeId]?.supportsDrillDown ?? false;
}
