'use client';
/**
 * /app/my-work — Staff My Work dashboard.
 * Shows tasks assigned to the current user, pending approvals, recent activity.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';

export default function MyWorkPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    setSession(s);
  }, [router]);

  if (!session) return null;

  return (
    <main id="main-content" style={{ padding: '24px', fontFamily: "'Exo 2', system-ui, sans-serif", color: '#F1F5F9' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 8px' }}>My Work</h1>
      <p style={{ color: 'rgba(241,245,249,0.60)', margin: '0 0 24px', fontSize: '0.75rem' }}>
        Assigned tasks, approvals requiring your action, and recent activity · {session.user.fullName}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {[
          { title: 'My Tasks', icon: '✓', desc: 'Tasks assigned to you', link: '/app/approvals' },
          { title: 'Pending Approvals', icon: '✅', desc: 'Items waiting for your decision', link: '/app/approvals' },
          { title: 'Recent Activity', icon: '◷', desc: 'Your recent actions', link: '/app/activity' },
          { title: 'Notifications', icon: '🔔', desc: 'Unread notifications', link: '/app/notifications' },
        ].map((item) => (
          <a key={item.title} href={item.link} style={{ display: 'block', textDecoration: 'none', background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(111,45,141,0.20)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{item.icon}</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#F1F5F9' }}>{item.title}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', marginTop: '4px' }}>{item.desc}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
