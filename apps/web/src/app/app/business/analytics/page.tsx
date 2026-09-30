'use client';
import { PlannedPage } from '@/components/planned-page/PlannedPage';
export default function BusinessAnalyticsPage() {
  return <PlannedPage section="Business · Analytics" title="Analytics" description="Deep-dive data analytics across all connected systems." note="Analytics dashboards require live connected data from at least one operational system (ERP, CRM, or finance connector)." backHref="/app/business" backLabel="← Business Overview" />;
}
