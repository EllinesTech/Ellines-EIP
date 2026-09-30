'use client';
/**
 * /app/alerts — Business alerts and attention items.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getAttentionItems, dismissAttentionItem, type AttentionItem } from '@/lib/api';

const SEVERITY_STYLE: Record<string, { border: string; bg: string; color: string; label: string }> = {
  critical: { border: '#EF4444', bg: 'rgba(239,68,68,0.08)', color: '#EF4444', label: '🔴 CRITICAL' },
  high:     { border: '#F59E0B', bg: 'rgba(245,158,11,0.08)', color: '#F59E0B', label: '🟠 HIGH' },
  medium:   { border: '#3B82F6', bg: 'rgba(59,130,246,0.08)', color: '#3B82F6', label: '🔵 MEDIUM' },
  low:      { border: 'rgba(241,245,249,0.20)', bg: 'rgba(241,245,249,0.04)', color: 'rgba(241,245,249,0.60)', label: '⚪ LOW' },
};

export default function AlertsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAttentionItems();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    load();
  }, [load, router]);

  const dismiss = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try { await dismissAttentionItem(id); } catch { load(); }
  };

  return (
    <main id="main-content" style={{ padding: '24px', maxWidth: 800, margin: '0 auto', fontFamily: "'Exo 2', system-ui, sans-serif", color: '#F1F5F9' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 8px' }}>Alerts</h1>
      <p style={{ color: 'rgba(241,245,249,0.60)', fontSize: '0.75rem', margin: '0 0 24px' }}>
        Business events requiring your attention
      </p>
      {error && <div role="alert" style={{ color: '#EF4444', marginBottom: 16, fontSize: '0.75rem' }}>{error}</div>}
      {loading ? (
        <p style={{ color: 'rgba(241,245,249,0.60)' }}>Loading alerts…</p>
      ) : items.length === 0 ? (
        <div style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(111,45,141,0.20)', borderRadius: 12, padding: '48px', textAlign: 'center', color: 'rgba(241,245,249,0.60)' }}>
          <p style={{ margin: 0, fontSize: '1rem' }}>✓ No alerts</p>
          <p style={{ margin: '8px 0 0', fontSize: '0.75rem' }}>Everything looks good.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => {
            const s = SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.low;
            return (
              <div key={item.id} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '16px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: s.color, flexShrink: 0 }}>{s.label}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{item.affectedEntity}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(241,245,249,0.60)', marginTop: 4 }}>{item.evidence}</div>
                  {item.recurrence && <span style={{ fontSize: '0.625rem', background: 'rgba(111,45,141,0.25)', color: '#F1F5F9', padding: '1px 8px', borderRadius: 4, marginTop: 4, display: 'inline-block' }}>↻ Recurrence</span>}
                </div>
                <button onClick={() => dismiss(item.id)} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: 'rgba(241,245,249,0.40)', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
