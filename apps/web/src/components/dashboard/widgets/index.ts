/**
 * Dashboard Widget Stubs — Task 18.1
 *
 * Thin re-exports that wrap the canonical widget components from
 * `@/components/widgets` with dashboard-grid-aware wrappers.
 *
 * Each stub adds:
 *   - A `.widget-drag-handle` element so react-grid-layout can detect drags.
 *   - A consistent card chrome (border, background, title).
 *
 * Import these from `@/components/dashboard/widgets` inside the dashboard
 * builder, and the plain widgets from `@/components/widgets` elsewhere.
 */

export { default as DashboardKpiCard } from './DashboardKpiCard';
export { default as DashboardChartWidget } from './DashboardChartWidget';
export { DashboardWidgetShell } from './DashboardWidgetShell';
export type { DashboardWidgetShellProps } from './DashboardWidgetShell';
