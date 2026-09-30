'use client';
import { PlannedPage } from '@/components/planned-page/PlannedPage';
export default function CRMPage() {
  return <PlannedPage section="Customer Relationship" title="CRM" description="Leads, opportunities, customer activities, and follow-ups." note="CRM features require a connected CRM system (Salesforce, HubSpot, Zoho, or a custom connector)." backHref="/app" backLabel="← Home" />;
}
