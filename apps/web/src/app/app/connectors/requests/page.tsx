'use client';

/**
 * /app/connectors/requests — Integration requests for client org users.
 * Any org user can submit and view their org's requests.
 * Requirements: 12.5, 12.6
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';
import { ConnectorWizard } from '@/components/connector-wizard/ConnectorWizard';

interface IntegrationRequest {
  id: string;
  system_name: string;
  purpose: string | null;
  requested_connector_type: string | null;
  business_justification: string | null;
  status: string;
  created_at: string;
}

export default function IntegrationRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<IntegrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = typeof window !== 'undefined' ? getSession() : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/connectors/integration-requests');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { requests: IntegrationRequest[] };
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) { router.replace('/login'); return; }
    load();
  }, [load, router, session]);

  const STATUS_COLOUR: Record<string, string> = { pending: '#F59E0B', approved: '#22C55E', rejected: '#EF4444', cancelled: 'var(--brand-text-muted)' };

  const panelStyle: React.CSSProperties = { background: 'var(--surface-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-3)' };

  if (showWizard && session) {
    return (
      <main id="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: 'var(--space-6)' }}>
        <ConnectorWizard
          orgId={session.organization.id}
          onSubmitted={(id) => { setShowWizard(false); load(); }}
          onClose={() => setShowWizard(false)}
        />
      </main>
    );
  }

  return (
    <main id="main-content" style={{ padding: 'var(--space-6)', maxWidth: 800, margin: '0 auto', fontFamily: "'Exo 2', system-ui, sans-serif", color: 'var(--brand-text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-l1-size)', fontWeight: 'var(--font-l1-weight)', margin: 0 }}>Integration Requests</h1>
          <p style={{ color: 'var(--brand-text-muted)', margin: 'var(--space-1) 0 0', fontSize: 'var(--font-l5-size)' }}>
            Request a new system connection — your Platform Admin will review and install it.
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          style={{ padding: 'var(--space-2) var(--space-6)', background: 'var(--brand-primary)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--font-l5-size)', fontWeight: 600 }}
        >
          + New request
        </button>
      </div>

      {error && <div role="alert" style={{ color: 'var(--status-error)', fontSize: 'var(--font-l5-size)', marginBottom: 'var(--space-4)' }}>{error}</div>}

      {loading ? <p style={{ color: 'var(--brand-text-muted)' }}>Loading…</p> : requests.length === 0 ? (
        <div style={{ ...panelStyle, textAlign: 'center', color: 'var(--brand-text-muted)', padding: 'var(--space-12)' }}>
          <p>No integration requests yet.</p>
        </div>
      ) : (
        requests.map((r) => (
          <div key={r.id} style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
              <div>
                <div style={{ fontSize: 'var(--font-l3-size)', fontWeight: 600 }}>{r.system_name}</div>
                <div style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', marginTop: 'var(--space-1)' }}>
                  {r.requested_connector_type ?? '—'} · {new Date(r.created_at).toLocaleDateString()}
                </div>
                {r.business_justification && <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', margin: 'var(--space-2) 0 0' }}>{r.business_justification}</p>}
              </div>
              <span style={{ fontSize: 'var(--font-l5-size)', fontWeight: 600, color: STATUS_COLOUR[r.status] ?? 'var(--brand-text-muted)', flexShrink: 0, textTransform: 'uppercase' }}>
                {r.status}
              </span>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
