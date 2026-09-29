/**
 * Server page wrapper for /app/dashboards/[id].
 * Returns a placeholder param so Next.js static export doesn't reject this route.
 * All real data loading is done client-side by DashboardClient.
 * Requirements: 30.2
 */
import DashboardClient from './DashboardClient';

export function generateStaticParams() {
  // Static export requires at least one param — real IDs load client-side.
  return [{ id: '__placeholder__' }];
}

export default function DashboardDetailPage() {
  return <DashboardClient />;
}
