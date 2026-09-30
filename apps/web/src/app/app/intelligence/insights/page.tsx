'use client';
import { PlannedPage } from '@/components/planned-page/PlannedPage';
export default function InsightsPage() {
  return <PlannedPage section="Intelligence · Insights" title="Insights" description="AI-generated insights from live connected data." note="Insights require live data from at least one connected operational system. Install a connector to activate." backHref="/app/intelligence" backLabel="← Intelligence" />;
}
