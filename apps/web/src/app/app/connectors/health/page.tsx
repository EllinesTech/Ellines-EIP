'use client';

/**
 * /app/connectors/health — Live connector health for client org users.
 * Uses authenticated getConnectorHealth() from api.ts.
 * Read-only: reauthorize/pause/resume/rotate are platform admin only.
 * Requirements: 21.1–21.6
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getConnectorHealth, type ConnectorHealthResponse } from '@/lib/api';

const STATUS_DOT: Record<string, string> = {
  synced: '#22C55E', active: '#22C55E', connected: '#22C55E',
  degraded: '#F59E0B', error: '#EF4444', auth_required: '#EF4444',
  draft: 'rgba(241,245,249,0.30)', idle: 'rgba(241,245,249,0.30)',
  revoked: 'rgba(241,245,249,0.15)', paused: '#3B82F6',
};

const POLL_MS = 30_000;

export default function ConnectorHealthPage() {
  const router = useRouter();
  const [health, setHealth] = useState<ConnectorHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const session = typeof window !== 'undefined' ? getSession() : null;

  const load = useCallback(async () => {
    try {
      const data = await getConnectorHealth();
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

  const panel: React.CSSProperties = { background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(111,45,141,0.20)', borderRadius: '12px', padding: '16px', marginBottom: '12px' };

  return (
    <main id="main-content" style={{ padding: '24px', maxWidth: 900, margin: '0 auto', fontFamily: "'Exo 2', system-ui, sans-serif", color: '#F1F5F9' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>Connector Health</h1>
        <p style={{ color: 'rgba(241,245,249,0.60)', margin: '4px 0 0', fontSize: '0.75rem' }}>
          Live status of connected systems · {session?.organization?.name}
          {health && ` · Checked ${new Date(health.checkedAt).toLocaleTimeString()}`}
        </p>
      </header>

      {error && (
        <div role="alert" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {loading && <p style={{ color: 'rgba(241,245,249,0.60)' }}>Loading connector health…</p>}

      {health && (
        <>
          {/* Overall status panel */}
          <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall Status</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: health.overallStatus === 'ok' ? '#22C55E' : health.overallStatus === 'error' ? '#EF4444' : '#F59E0B', marginTop: '4px' }}>
                {health.overallStatus.toUpperCase()}
              </div>
            </div>
            <div style={{ fontSize: '0.9375rem', color: 'rgba(241,245,249,0.60)' }}>
              {health.connectors.length} connector{health.connectors.length !== 1 ? 's' : ''}
            </div>
          </div>

          {health.connectors.length === 0 ? (
            <div style={{ ...panel, textAlign: 'center', padding: '48px', color: 'rgba(241,245,249,0.60)' }}>
              <p style={{ margin: 0 }}>No connectors installed for this organization.</p>
              <p style={{ fontSize: '0.75rem', margin: '8px 0 0' }}>
                <a href="/app/connectors/requests" style={{ color: '#2563EB' }}>Submit an Integration Request</a> to get started.
              </p>
            </div>
          ) : (
            health.connectors.map((c) => (
              <div key={c.id} style={panel} role="article" aria-label={`${c.displayName} connector`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_DOT[c.status] ?? 'rgba(241,245,249,0.40)', flexShrink: 0 }}
                    title={`Status: ${c.status}`}
                    aria-label={`Status: ${c.status}`}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>{c.displayName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', marginTop: '2px' }}>{c.catalogId}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)' }}>
                    <div style={{ color: STATUS_DOT[c.status] ?? 'rgba(241,245,249,0.40)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem' }}>{c.status}</div>
                    <div>Last sync: {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : 'Never'}</div>
                    {c.openAlerts > 0 && <div style={{ color: '#F59E0B' }}>⚠ {c.openAlerts} alert{c.openAlerts !== 1 ? 's' : ''}</div>}
                  </div>
                </div>
                {c.message && (
                  <div style={{ marginTop: '12px', fontSize: '0.75rem', color: c.status === 'error' ? '#EF4444' : 'rgba(241,245,249,0.60)', borderTop: '1px solid rgba(111,45,141,0.20)', paddingTop: '8px' }}>
                    {c.message}
                  </div>
                )}
                {(c.recordCount > 0 || c.healthScore > 0) && (
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)' }}>
                    {c.recordCount > 0 && <span>Records synced: {c.recordCount.toLocaleString()}</span>}
                    {c.healthScore > 0 && <span>Health score: {c.healthScore}%</span>}
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
