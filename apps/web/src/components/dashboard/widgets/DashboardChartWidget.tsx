'use client';

/**
 * DashboardChartWidget — Task 18.1
 *
 * Generic chart widget stub for the dashboard grid.
 * Wraps any chart type via the WidgetRenderer.
 */

import { DashboardWidgetShell } from './DashboardWidgetShell';
import WidgetRenderer from '@/components/widgets/WidgetRenderer';
import type { WidgetProps } from '@/components/widgets/widget.types';

interface DashboardChartWidgetProps extends WidgetProps {
  widgetType: string;
}

export default function DashboardChartWidget({
  widgetType,
  ...props
}: DashboardChartWidgetProps) {
  return (
    <DashboardWidgetShell title={props.title}>
      <WidgetRenderer type={widgetType} {...props} />
    </DashboardWidgetShell>
  );
}
