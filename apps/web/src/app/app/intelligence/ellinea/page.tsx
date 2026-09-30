'use client';

/**
 * /app/intelligence/ellinea — Ellinea AI full workspace.
 * Full-screen Ellinea Ask + memory + learning panel.
 * Redirects to the existing /app/ellinea full workspace.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';

export default function IntelligenceEllineaPage() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace('/login'); return; }
    // Redirect to the full Ellinea workspace
    router.replace('/app/ellinea');
  }, [router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#8b95a8', fontFamily: "'Exo 2', system-ui, sans-serif" }}>
      <p>Redirecting to Ellinea AI…</p>
    </div>
  );
}
