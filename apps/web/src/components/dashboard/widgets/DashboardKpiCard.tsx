'use client';

/**
 * DashboardKpiCard — Task 18.1
 *
 * KPI card stub for the dashboard grid.
 * Delegates rendering to the canonical KpiCard widget.
 */

import { DashboardWidgetShell } from './DashboardWidgetShell';
import KpiCard from '@/components/widgets/KpiCard';
import type { WidgetProps } from '@/components/widgets/widget.types';

export default function DashboardKpiCard(props: WidgetProps) {
  return (
    <DashboardWidgetShell title={props.title}>
      <KpiCard {...props} />
    </DashboardWidgetShell>
  );
}
