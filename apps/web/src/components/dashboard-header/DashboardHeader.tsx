'use client';

/**
 * DashboardHeader — Persistent header for all client dashboard routes.
 *
 * - Mounted in the /app layout; does NOT unmount between route transitions.
 * - Shows current org name + role prominently (Req 10.1, 7.5).
 * - Multi-org selector visible when user belongs to more than one org (Req 7.1, 10.2).
 * - Notification badge polls /api/v1/dashboards/attention every 60 s (Req 6.3).
 * - Refreshing indicator auto-clears after 30 s (Req 10.6).
 * - All interactive elements Tab/Enter/Space accessible (Req 10.5, 11.1).
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import styles from './DashboardHeader.module.css';

interface OrgMembership {
  id: string;
  name: string;
  role: string;
}

interface DashboardHeaderProps {
  orgName: string;
  orgRole: string;
  orgMemberships: OrgMembership[];
  refreshingCount: number;
  onOrgSwitch: (orgId: string) => void;
}

const ATTENTION_POLL_MS = 60_000;
const REFRESH_STALE_MS = 30_000;

export function DashboardHeader({
  orgName,
  orgRole,
  orgMemberships,
  refreshingCount,
  onOrgSwitch,
}: DashboardHeaderProps) {
  const [attentionCount, setAttentionCount] = useState(0);
  const [refreshError, setRefreshError] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Attention badge poll ──────────────────────────────────────────────────
  const fetchAttention = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/dashboards/attention');
      if (!res.ok) return;
      const data = await res.json() as { items?: Array<{ severity: string }> };
      const criticalHigh = (data.items ?? []).filter(
        (i) => i.severity === 'critical' || i.severity === 'high',
      ).length;
      setAttentionCount(criticalHigh);
    } catch {
      // Silent — badge shows last known count
    }
  }, []);

  useEffect(() => {
    fetchAttention();
    const interval = setInterval(fetchAttention, ATTENTION_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchAttention]);

  // ── Auto-clear refreshing indicator ──────────────────────────────────────
  useEffect(() => {
    if (refreshingCount > 0) {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      setRefreshError(false);
      refreshTimerRef.current = setTimeout(() => {
        setRefreshError(true);
      }, REFRESH_STALE_MS);
    } else {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      setRefreshError(false);
    }
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [refreshingCount]);

  const currentOrg = orgMemberships.find((m) => m.name === orgName);
  const currentOrgId = currentOrg?.id ?? '';

  return (
    <header className={styles.header} role="banner">
      {/* Business selector — visible when multi-org */}
      <div className={styles.orgSelector}>
        {orgMemberships.length > 1 ? (
          <select
            className={styles.orgSelect}
            value={currentOrgId}
            onChange={(e) => onOrgSwitch(e.target.value)}
            aria-label="Select active business"
          >
            {orgMemberships.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.orgName} aria-label={`Current business: ${orgName}`}>
            {orgName}
          </span>
        )}
      </div>

      {/* Role badge */}
      <span className={styles.orgRole} aria-label={`Your role: ${orgRole}`}>
        {orgRole}
      </span>

      <div className={styles.spacer} />

      {/* Refresh indicator */}
      {refreshingCount > 0 && (
        <div
          className={`${styles.refreshIndicator} ${refreshError ? styles.refreshError : ''}`}
          role="status"
          aria-live="assertive"
          aria-label={refreshError ? 'Refresh error' : 'Refreshing data…'}
        >
          {refreshError ? '⚠ Refresh error' : '↻ Refreshing…'}
        </div>
      )}

      <div className={styles.actions}>
        {/* Notification button */}
        <button
          className={styles.iconBtn}
          aria-label={`Notifications${attentionCount > 0 ? ` — ${attentionCount} critical or high items` : ''}`}
          onClick={() => {/* open attention panel */}}
        >
          🔔
          {attentionCount > 0 && (
            <span
              className={styles.badge}
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${attentionCount} critical or high attention items`}
            >
              {attentionCount > 99 ? '99+' : attentionCount}
            </span>
          )}
        </button>

        {/* Search */}
        <button
          className={styles.iconBtn}
          aria-label="Global search"
          onClick={() => {/* open search */}}
        >
          🔍
        </button>

        {/* Ellinea */}
        <button
          className={styles.iconBtn}
          aria-label="Ask Ellinea AI"
          onClick={() => {/* open Ellinea chat */}}
        >
          🤖
        </button>

        {/* Profile */}
        <button
          className={styles.iconBtn}
          aria-label="Profile menu"
          onClick={() => {/* open profile */}}
        >
          👤
        </button>
      </div>
    </header>
  );
}
