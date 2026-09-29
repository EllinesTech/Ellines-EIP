'use client';

/**
 * /app/dashboards — Client Dashboard list page.
 * Uses the new /api/v1/dashboards (client_dashboards table, spec: client-dashboard-connector-platform).
 * All roles can view; owners/managers can create.
 * Requirements: 30.1, 3.1–3.8
 */

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';

interface ClientDashboard {
  id: string;
  name: string;
  description: string;
  type: string;
  visibility: string;
  is_default: boolean;
  refresh_policy: number;
  created_at: string;
  updated_at: string;
}

const DASHBOARD_TYPES = [
  'EXECUTIVE', 'OPERATIONS', 'FINANCE', 'HR', 'SALES',
  'INVENTORY', 'CRM', 'CUSTOM', 'STAFF_MY_WORK',
];

export default function ClientDashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<ClientDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', type: 'CUSTOM', visibility: 'PRIVATE', refreshPolicy: 300 });

  const session = typeof window !== 'undefined' ? getSession() : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/dashboards');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { dashboards: ClientDashboard[] };
      setDashboards(data.dashboards ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) { router.replace('/login'); return; }
    load();
  }, [load, router, session]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, type: form.type, visibility: form.visibility, refreshPolicy: form.refreshPolicy }),
      });
      const data = await res.json() as { dashboard?: ClientDashboard; message?: string };
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      setDashboards((prev) => [data.dashboard!, ...prev]);
      setShowForm(false);
      setForm({ name: '', description: '', type: 'CUSTOM', visibility: 'PRIVATE', refreshPolicy: 300 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create dashboard');
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete dashboard "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/dashboards/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json() as { message?: string }; throw new Error(d.message ?? 'Failed'); }
      setDashboards((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const panelStyle: React.CSSProperties = {
    background: 'var(--surface-base)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-6)',
    marginBottom: 'var(--space-4)',
  };

  const btnPrimary: React.CSSProperties = {
    padding: 'var(--space-2) var(--space-6)',
    background: 'var(--brand-primary)',
    color: 'var(--brand-text)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'var(--font-l5-size)',
    fontWeight: 600,
  };

  const btnGhost: React.CSSProperties = {
    ...btnPrimary,
    background: 'transparent',
    border: '1px solid var(--border-default)',
    color: 'var(--brand-text-muted)',
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--brand-text)',
    padding: 'var(--space-2) var(--space-3)',
    fontFamily: 'inherit',
    fontSize: 'var(--font-l4-size)',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <main
      id="main-content"
      style={{ padding: 'var(--space-6)', maxWidth: 900, margin: '0 auto', fontFamily: "'Exo 2', system-ui, sans-serif", color: 'var(--brand-text)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-l1-size)', fontWeight: 'var(--font-l1-weight)', margin: 0 }}>
            Dashboards
          </h1>
          <p style={{ color: 'var(--brand-text-muted)', margin: 'var(--space-1) 0 0', fontSize: 'var(--font-l5-size)' }}>
            {session?.organization?.name} · {dashboards.length} dashboard{dashboards.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button style={btnPrimary} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ New dashboard'}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ color: 'var(--status-error)', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--severity-critical)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-l5-size)' }}>
          {error}
        </div>
      )}

      {showForm && (
        <div style={panelStyle}>
          <h2 style={{ fontSize: 'var(--font-l2-size)', margin: '0 0 var(--space-4)' }}>Create dashboard</h2>
          <form onSubmit={onCreate} style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <label>
              <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>Name *</span>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={1} maxLength={120} placeholder="Executive Overview" />
            </label>
            <label>
              <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>Description</span>
              <input style={inputStyle} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={500} placeholder="KPIs, trends, and alerts" />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
              <label>
                <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>Type</span>
                <select style={inputStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {DASHBOARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>Visibility</span>
                <select style={inputStyle} value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}>
                  {['PRIVATE','SHARED','PUBLISHED'].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>Refresh (seconds)</span>
                <input style={inputStyle} type="number" min={30} max={86400} value={form.refreshPolicy} onChange={(e) => setForm((f) => ({ ...f, refreshPolicy: Number(e.target.value) }))} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" style={btnPrimary} disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--brand-text-muted)' }}>Loading dashboards…</p>
      ) : dashboards.length === 0 ? (
        <div style={{ ...panelStyle, textAlign: 'center', color: 'var(--brand-text-muted)', padding: 'var(--space-12)' }}>
          <p style={{ fontSize: 'var(--font-l4-size)', margin: 0 }}>No dashboards yet.</p>
          <p style={{ fontSize: 'var(--font-l5-size)', margin: 'var(--space-2) 0 0' }}>Create your first dashboard to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {dashboards.map((d) => (
            <div key={d.id} style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Link href={`/app/dashboards/${d.id}`} style={{ fontSize: 'var(--font-l3-size)', fontWeight: 600, color: 'var(--brand-accent)', textDecoration: 'none' }}>
                    {d.name}
                  </Link>
                  {d.is_default && (
                    <span style={{ fontSize: 'var(--font-l5-size)', background: 'rgba(111,45,141,0.25)', color: 'var(--brand-text)', padding: '1px var(--space-2)', borderRadius: 'var(--radius-sm)' }}>Default</span>
                  )}
                  <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)' }}>{d.type}</span>
                  <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)' }}>·</span>
                  <span style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)' }}>{d.visibility}</span>
                </div>
                {d.description && <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', margin: 'var(--space-1) 0 0' }}>{d.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                <Link href={`/app/dashboards/${d.id}`} style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open</Link>
                <button style={btnGhost} onClick={() => onDelete(d.id, d.name)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
