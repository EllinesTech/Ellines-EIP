'use client';

/**
 * /app/dashboards — Client Dashboard list (Command Center entry point).
 * Uses authenticated API helpers from api.ts — Authorization header included automatically.
 * Requirements: 30.1, 3.1–3.8
 */

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getSession,
  listClientDashboards,
  createClientDashboard,
  deleteClientDashboard,
  duplicateClientDashboard,
  setDefaultClientDashboard,
  type ClientDashboardSummary,
} from '@/lib/api';

const DASHBOARD_TYPES = [
  'EXECUTIVE', 'OPERATIONS', 'FINANCE', 'HR', 'SALES',
  'INVENTORY', 'CRM', 'CUSTOM', 'STAFF_MY_WORK',
];

export default function ClientDashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<ClientDashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', type: 'CUSTOM', visibility: 'PRIVATE', refreshPolicy: 300 });

  const session = typeof window !== 'undefined' ? getSession() : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listClientDashboards();
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
      const data = await createClientDashboard({
        name: form.name,
        description: form.description,
        type: form.type,
        visibility: form.visibility,
        refreshPolicy: form.refreshPolicy,
      });
      setDashboards((prev) => [data.dashboard, ...prev]);
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
      await deleteClientDashboard(id);
      setDashboards((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const onDuplicate = async (id: string) => {
    try {
      const data = await duplicateClientDashboard(id);
      setDashboards((prev) => [data.dashboard, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed');
    }
  };

  const onSetDefault = async (id: string) => {
    try {
      await setDefaultClientDashboard(id);
      await load(); // reload to reflect updated is_default flags
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default');
    }
  };

  // ── Styles using glass-ui tokens ─────────────────────────────────────────
  const panel: React.CSSProperties = {
    background: 'var(--surface-base, rgba(15,23,42,0.85))',
    border: '1px solid var(--border-default, rgba(111,45,141,0.20))',
    borderRadius: 'var(--radius-lg, 12px)',
    padding: '16px',
    marginBottom: '12px',
  };
  const btnPrimary: React.CSSProperties = { padding: '8px 24px', background: 'var(--brand-primary, #6F2D8D)', color: '#F1F5F9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600 };
  const btnGhost: React.CSSProperties = { ...btnPrimary, background: 'transparent', border: '1px solid rgba(111,45,141,0.3)', color: 'rgba(241,245,249,0.60)' };
  const btnAccent: React.CSSProperties = { ...btnPrimary, background: 'var(--brand-accent, #2563EB)' };
  const inputStyle: React.CSSProperties = { background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(111,45,141,0.20)', borderRadius: '8px', color: '#F1F5F9', padding: '8px 12px', fontFamily: 'inherit', fontSize: '0.9375rem', width: '100%', boxSizing: 'border-box' };

  return (
    <main id="main-content" style={{ padding: '24px', maxWidth: 960, margin: '0 auto', fontFamily: "'Exo 2', system-ui, sans-serif", color: '#F1F5F9' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>Dashboards</h1>
          <p style={{ color: 'rgba(241,245,249,0.60)', margin: '4px 0 0', fontSize: '0.75rem' }}>
            {session?.organization?.name} · {dashboards.length} dashboard{dashboards.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button style={btnPrimary} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ New dashboard'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div style={panel}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 16px' }}>Create dashboard</h2>
          <form onSubmit={onCreate} style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <label>
                <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', display: 'block', marginBottom: '4px' }}>Name *</span>
                <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={1} maxLength={120} placeholder="Executive Overview" />
              </label>
              <label>
                <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', display: 'block', marginBottom: '4px' }}>Type</span>
                <select style={inputStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {DASHBOARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <label>
              <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', display: 'block', marginBottom: '4px' }}>Description</span>
              <input style={inputStyle} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={500} placeholder="KPIs, trends, and operational alerts" />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <label>
                <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', display: 'block', marginBottom: '4px' }}>Visibility</span>
                <select style={inputStyle} value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}>
                  {['PRIVATE', 'SHARED', 'PUBLISHED'].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', display: 'block', marginBottom: '4px' }}>Auto-refresh (seconds)</span>
                <input style={inputStyle} type="number" min={30} max={86400} value={form.refreshPolicy} onChange={(e) => setForm((f) => ({ ...f, refreshPolicy: Number(e.target.value) }))} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" style={btnPrimary} disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Dashboard list */}
      {loading ? (
        <p style={{ color: 'rgba(241,245,249,0.60)' }}>Loading dashboards…</p>
      ) : dashboards.length === 0 ? (
        <div style={{ ...panel, textAlign: 'center', padding: '48px', color: 'rgba(241,245,249,0.60)' }}>
          <p style={{ fontSize: '0.9375rem', margin: 0 }}>No dashboards yet.</p>
          <p style={{ fontSize: '0.75rem', margin: '8px 0 0' }}>Create your first dashboard to start tracking your business.</p>
          <button style={{ ...btnPrimary, marginTop: '16px' }} onClick={() => setShowForm(true)}>Create first dashboard</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {dashboards.map((d) => (
            <div key={d.id} style={{ ...panel, display: 'flex', alignItems: 'center', gap: '16px', marginBottom: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Link href={`/app/dashboards/${d.id}`} style={{ fontSize: '1rem', fontWeight: 600, color: '#2563EB', textDecoration: 'none' }}>
                    {d.name}
                  </Link>
                  {d.is_default && <span style={{ fontSize: '0.625rem', background: 'rgba(111,45,141,0.25)', color: '#F1F5F9', padding: '1px 8px', borderRadius: '4px', fontWeight: 600 }}>DEFAULT</span>}
                  <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.40)', textTransform: 'uppercase' }}>{d.type}</span>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.40)' }}>·</span>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.40)' }}>{d.visibility}</span>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.40)' }}>· refresh {d.refresh_policy}s</span>
                </div>
                {d.description && <p style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', margin: '4px 0 0' }}>{d.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                <Link href={`/app/dashboards/${d.id}`} style={{ ...btnAccent, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open</Link>
                {!d.is_default && <button style={btnGhost} onClick={() => onSetDefault(d.id)}>Set default</button>}
                <button style={btnGhost} onClick={() => onDuplicate(d.id)}>Duplicate</button>
                <button style={{ ...btnGhost, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => onDelete(d.id, d.name)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
