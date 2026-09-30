'use client';
/**
 * /app/activity — Recent business activity feed.
 */
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';

export default function ActivityPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getSession()) router.replace('/login');
  }, [router]);

  return (
    <main id="main-content" style={{ padding: '24px', fontFamily: "'Exo 2', system-ui, sans-serif", color: '#F1F5F9' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 8px' }}>Activity</h1>
      <p style={{ color: 'rgba(241,245,249,0.60)', fontSize: '0.75rem', margin: '0 0 24px' }}>Recent business events and user actions in your organization</p>
      <div style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(111,45,141,0.20)', borderRadius: 12, padding: '48px', textAlign: 'center', color: 'rgba(241,245,249,0.60)' }}>
        <p style={{ margin: 0 }}>Activity feed requires connected data sources.</p>
        <p style={{ margin: '8px 0 0', fontSize: '0.75rem' }}>
          Connect a system via <a href="/app/connectors/requests" style={{ color: '#2563EB' }}>Integration Requests</a> to populate this feed.
        </p>
      </div>
    </main>
  );
}
