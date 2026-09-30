'use client';
import { PlannedPage } from '@/components/planned-page/PlannedPage';
export default function RecommendationsPage() {
  return <PlannedPage section="Intelligence · Recommendations" title="Recommendations" description="AI-generated recommendations for your organisation." note="Recommendations require live data and Ellinea learning history. Connect a system and interact with Ellinea AI to activate." backHref="/app/intelligence" backLabel="← Intelligence" />;
}
