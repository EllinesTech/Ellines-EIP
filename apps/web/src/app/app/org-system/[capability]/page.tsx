import { ORG_SYSTEM_DYNAMIC_SLUGS } from '@/lib/org-system-catalog';
import OrgSystemCapabilityClient from './CapabilityClient';

export function generateStaticParams() {
  return [...ORG_SYSTEM_DYNAMIC_SLUGS].map((capability) => ({ capability }));
}

export default function OrgSystemCapabilityPage() {
  return <OrgSystemCapabilityClient />;
}
