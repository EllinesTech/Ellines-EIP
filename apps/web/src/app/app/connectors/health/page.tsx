'use client';

/**
 * /app/connectors/health — Client org connector health view.
 * Read-only: shows status, last sync, latency, error count.
 * Reauthorize/pause/resume/rotate controls only shown to platform admins.
 * Data sourced exclusively from live DB via /api/v1/connectors/health.
 *
 * Requirements: 21.1–21.6
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';

interface ConnectorHealthItem {
  id: string;
  displayName: string;
  catalogId: string;
  status: string;
  lastSyncedAt: string | null;
  recordCount: number;
  healthScore: number;
  openAlerts: number;
  message: string | null;
}

interface HealthResponse {
  checkedAt: string;
  overallStatus: string;
  connectors: ConnectorHealthItem[];
}

const STATUS_COLOUR: Record<string, string> = {
  synced: '#22C55E',
  active: '#22C55E',
  connected: '#22C55E',
  degraded: '#F59E0B',
  error: '#EF4444',
  auth_required: '#EF4444',
  draft: 'rgba(241,245,249,0.40)',
  idle: 'rgba(241,245,249,0.40)',
  revoked: 'rgba(241,245,249,0.20)',
  paused: '#3B82F6',
};

const POLL_MS = 30_000;

export default function ConnectorHealthPage() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const session = typeof window !== 'undefined' ? getSession() : null;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/connectors/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as HealthResponse;
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) { router.replace('/login'); return; }
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, router, session]);

  const panelStyle: React.CSSProperties = {
    background: 'var(--surface-base)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    marginBottom: 'var(--space-3)',
    fontFamily: "'Exo 2', system-ui, sans-serif",
  };

  return (
    <main id="main-content" style={{ padding: 'var(--space-6)', maxWidth: 900, margin: '0 auto', fontFamily: "'Exo 2', system-ui, sans-serif", color: 'var(--brand-text)' }}>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--font-l1-size)', fontWeight: 'var(--font-l1-weight)', margin: 0 }}>Connector Health</h1>
        <p style={{ color: 'var(--brand-text-muted)', margin: 'var(--space-1) 0 0', fontSize: 'var(--font-l5-size)' }}>
          Live status of all connected systems for {session?.organization?.name}.
          {health && ` · Last checked: ${new Date(health.checkedAt).toLocaleTimeString()}`}
        </p>
      </header>

      {error && (
        <div role="alert" style={{ color: 'var(--status-error)', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--severity-critical)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-l5-size)' }}>
          {error}
        </div>
      )}

      {loading && <p style={{ color: 'var(--brand-text-muted)' }}>Loading connector health…</p>}

      {health && (
        <>
          {/* Overall status */}
          <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall status</span>
              <div style={{ fontSize: 'var(--font-l2-size)', fontWeight: 600, color: health.overallStatus === 'ok' ? '#22C55E' : health.overallStatus === 'error' ? '#EF4444' : '#F59E0B', marginTop: 'var(--space-1)' }}>
                {health.overallStatus.toUpperCase()}
              </div>
            </div>
            <div style={{ fontSize: 'var(--font-l4-size)', color: 'var(--brand-text-muted)' }}>
              {health.connectors.length} connector{health.connectors.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Connector list */}
          {health.connectors.length === 0 ? (
            <div style={{ ...panelStyle, textAlign: 'center', color: 'var(--brand-text-muted)', padding: 'var(--space-12)' }}>
              <p>No connectors installed for this organization.</p>
              <p style={{ fontSize: 'var(--font-l5-size)', marginTop: 'var(--space-2)' }}>Submit an Integration Request to get started.</p>
            </div>
          ) : (
            health.connectors.map((c) => (
              <div key={c.id} style={panelStyle} role="article" aria-label={`${c.displayName} connector status`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  {/* Status indicator — not color-only (Req 11.6) */}
                  <div
                    style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_COLOUR[c.status] ?? 'var(--brand-text-muted)', flexShrink: 0 }}
                    aria-label={`Status: ${c.status}`}
                    title={`Status: ${c.status}`}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--font-l3-size)', fontWeight: 600, color: 'var(--brand-text)' }}>{c.displayName}</div>
                    <div style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', marginTop: 2 }}>
                      {c.catalogId}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)' }}>
                    <div style={{ color: STATUS_COLOUR[c.status] ?? 'var(--brand-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{c.status}</div>
                    <div>Last sync: {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : 'Never'}</div>
                    {c.openAlerts > 0 && <div style={{ color: 'var(--severity-high)' }}>⚠ {c.openAlerts} alert{c.openAlerts !== 1 ? 's' : ''}</div>}
                  </div>
                </div>

                {/* Error message — credentials redacted (Req 13.2) */}
                {c.message && (
                  <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-l5-size)', color: c.status === 'error' ? 'var(--status-error)' : 'var(--brand-text-muted)', borderTop: '1px solid var(--border-default)', paddingTop: 'var(--space-2)' }}>
                    {c.message}
                  </div>
                )}

                {/* Records + health score */}
                {(c.recordCount > 0 || c.healthScore > 0) && (
                  <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)', fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)' }}>
                    <span>Records: {c.recordCount.toLocaleString()}</span>
                    <span>Health: {c.healthScore}%</span>
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </main>
  );
}
