'use client';

/**
 * /app/connectors/requests — Integration requests for client org users.
 * Uses authenticated listIntegrationRequests() / createIntegrationRequest().
 * Requirements: 12.5, 12.6, 24.1–24.7
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getSession,
  listClientIntegrationRequests,
  type ClientIntegrationRequestDto,
} from '@/lib/api';
import { ConnectorWizard } from '@/components/connector-wizard/ConnectorWizard';

const STATUS_COLOUR: Record<string, string> = {
  pending: '#F59E0B', approved: '#22C55E', rejected: '#EF4444', cancelled: 'rgba(241,245,249,0.40)',
};

export default function IntegrationRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ClientIntegrationRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = typeof window !== 'undefined' ? getSession() : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listClientIntegrationRequests();
      setRequests(data.requests ?? []);
      setError(null);
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

  const panel: React.CSSProperties = { background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(111,45,141,0.20)', borderRadius: '12px', padding: '16px', marginBottom: '12px' };
  const btnPrimary: React.CSSProperties = { padding: '8px 24px', background: '#6F2D8D', color: '#F1F5F9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600 };

  if (showWizard && session) {
    return (
      <main id="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '24px', fontFamily: "'Exo 2', system-ui, sans-serif" }}>
        <ConnectorWizard
          orgId={session.organization.id}
          onSubmitted={() => { setShowWizard(false); load(); }}
          onClose={() => setShowWizard(false)}
        />
      </main>
    );
  }

  return (
    <main id="main-content" style={{ padding: '24px', maxWidth: 800, margin: '0 auto', fontFamily: "'Exo 2', system-ui, sans-serif", color: '#F1F5F9' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>Integration Requests</h1>
          <p style={{ color: 'rgba(241,245,249,0.60)', margin: '4px 0 0', fontSize: '0.75rem' }}>
            Request a new system connection — your Platform Admin will review and install it.
          </p>
        </div>
        <button style={btnPrimary} onClick={() => setShowWizard(true)}>+ New request</button>
      </div>

      {error && (
        <div role="alert" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'rgba(241,245,249,0.60)' }}>Loading requests…</p>
      ) : requests.length === 0 ? (
        <div style={{ ...panel, textAlign: 'center', padding: '48px', color: 'rgba(241,245,249,0.60)' }}>
          <p style={{ margin: 0 }}>No integration requests yet.</p>
          <p style={{ fontSize: '0.75rem', margin: '8px 0 0' }}>Use the guided wizard to request a new system connection.</p>
          <button style={{ ...btnPrimary, marginTop: '16px' }} onClick={() => setShowWizard(true)}>Start a request</button>
        </div>
      ) : (
        requests.map((r) => (
          <div key={r.id} style={panel}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>{r.system_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', marginTop: '4px' }}>
                  {r.requested_connector_type ?? '—'} · Submitted {new Date(r.created_at).toLocaleDateString()}
                </div>
                {r.business_justification && (
                  <p style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', margin: '8px 0 0', lineHeight: 1.5 }}>
                    {r.business_justification}
                  </p>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: STATUS_COLOUR[r.status] ?? 'rgba(241,245,249,0.60)', flexShrink: 0, textTransform: 'uppercase', border: `1px solid ${STATUS_COLOUR[r.status] ?? 'rgba(241,245,249,0.20)'}`, borderRadius: '4px', padding: '2px 8px' }}>
                {r.status}
              </span>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
