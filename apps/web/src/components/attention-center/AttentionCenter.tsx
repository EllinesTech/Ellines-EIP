'use client';

/**
 * AttentionCenter — Surfaces actionable items requiring user attention.
 *
 * - Polls GET /api/v1/dashboards/attention every 60 s.
 * - Dismiss: DELETE /api/v1/dashboards/attention/:itemId (optimistic).
 * - Recurrence flag shown as badge.
 * - Badge count fed upward via onBadgeCountChange callback.
 * - Zero cross-tenant data (org filter enforced server-side — Req 6.6).
 *
 * Requirements: 6.1–6.6
 */

import React, { useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttentionItem {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  sourceConnectorId?: string | null;
  affectedEntity: string;
  evidence: string;
  detectedAt: string;
  availableAction: 'view' | 'approve' | 'investigate' | 'dismiss';
  assignedTo?: string | null;
  recurrence?: boolean;
}

interface AttentionCenterProps {
  onBadgeCountChange?: (count: number) => void;
}

// ─── Severity colours ─────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, React.CSSProperties> = {
  critical: { borderLeft: '3px solid var(--severity-critical)', background: 'rgba(239,68,68,0.08)' },
  high:     { borderLeft: '3px solid var(--severity-high)',     background: 'rgba(245,158,11,0.08)' },
  medium:   { borderLeft: '3px solid var(--severity-medium)',   background: 'rgba(59,130,246,0.08)' },
  low:      { borderLeft: '3px solid var(--severity-low)',      background: 'rgba(241,245,249,0.04)' },
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const POLL_INTERVAL_MS = 60_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function AttentionCenter({ onBadgeCountChange }: AttentionCenterProps) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/dashboards/attention');
      if (!res.ok) {
        setError(`Failed to load attention items (HTTP ${res.status})`);
        return;
      }
      const data = await res.json() as { items?: AttentionItem[] };
      const fetched = (data.items ?? []).sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
      );
      setItems(fetched);
      setError(null);

      const criticalHigh = fetched.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
      onBadgeCountChange?.(criticalHigh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [onBadgeCountChange]);

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchItems]);

  const dismiss = useCallback(async (itemId: string) => {
    // Optimistic removal
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    const removedItem = snapshot.find((i) => i.id === itemId);
    const newCount = items.filter(
      (i) => i.id !== itemId && (i.severity === 'critical' || i.severity === 'high'),
    ).length;
    onBadgeCountChange?.(newCount);

    try {
      const res = await fetch(`/api/v1/dashboards/attention/${itemId}`, { method: 'DELETE' });
      if (!res.ok) {
        // Restore on failure
        if (removedItem) {
          setItems(snapshot);
          onBadgeCountChange?.(snapshot.filter((i) => i.severity === 'critical' || i.severity === 'high').length);
        }
      }
    } catch {
      // Restore on network error
      if (removedItem) {
        setItems(snapshot);
        onBadgeCountChange?.(snapshot.filter((i) => i.severity === 'critical' || i.severity === 'high').length);
      }
    }
  }, [items, onBadgeCountChange]);

  if (loading) {
    return (
      <section aria-label="Attention center" aria-busy="true">
        <p style={{ color: 'var(--brand-text-muted)', fontSize: 'var(--font-l5-size)' }}>
          Loading attention items…
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Attention center">
        <p role="alert" style={{ color: 'var(--status-error)', fontSize: 'var(--font-l5-size)' }}>
          {error}
        </p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section aria-label="Attention center">
        <p style={{ color: 'var(--brand-text-muted)', fontSize: 'var(--font-l5-size)' }}>
          No items requiring attention.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Attention center">
      <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {items.map((item) => (
          <li
            key={item.id}
            role="article"
            style={{
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-3)',
              ...SEVERITY_STYLE[item.severity],
            }}
            aria-label={`${item.severity} attention: ${item.affectedEntity}`}
          >
            {/* Severity indicator — not color-only per Req 11.6 */}
            <span
              aria-label={`Severity: ${item.severity}`}
              title={`Severity: ${item.severity}`}
              style={{ fontSize: 'var(--font-l5-size)', flexShrink: 0, fontWeight: 600, textTransform: 'uppercase' }}
            >
              {item.severity === 'critical' ? '🔴 CRIT' :
               item.severity === 'high'     ? '🟠 HIGH' :
               item.severity === 'medium'   ? '🔵 MED'  : '⚪ LOW'}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--font-l4-size)', color: 'var(--brand-text)', fontWeight: 500 }}>
                  {item.affectedEntity}
                </span>
                {item.recurrence && (
                  <span
                    style={{
                      fontSize: 'var(--font-l5-size)',
                      background: 'rgba(111,45,141,0.25)',
                      color: 'var(--brand-text)',
                      padding: '1px var(--space-2)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    aria-label="Recurrent issue"
                  >
                    ↻ Recurrence
                  </span>
                )}
              </div>
              <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', margin: 'var(--space-1) 0 0' }}>
                {item.evidence}
              </p>
              {item.sourceConnectorId && (
                <p style={{ fontSize: 'var(--font-l5-size)', color: 'var(--brand-text-muted)', margin: 'var(--space-1) 0 0' }}>
                  Source: {item.sourceConnectorId}
                </p>
              )}
            </div>

            {/* Dismiss */}
            <button
              onClick={() => dismiss(item.id)}
              aria-label={`Dismiss ${item.affectedEntity} attention item`}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--brand-text-muted)',
                cursor: 'pointer',
                padding: 'var(--space-1)',
                borderRadius: 'var(--radius-sm)',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
