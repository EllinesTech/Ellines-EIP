'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { getSession, getToken } from '@/lib/api';
import styles from '../command.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type GpsCoordinate = {
  lat: number;
  lng: number;
  timestamp?: number;
  speedKph?: number;
  heading?: number;
};

type AssetLocation = {
  assetId: string;
  assetName: string;
  kind: string;
  status?: string;
  branchId?: string;
  gps?: GpsCoordinate;
};

type FleetLocationsResponse = {
  assets: AssetLocation[];
  total: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  active:      { bg: 'rgba(16,185,129,0.15)',  color: '#6ee7b7', border: 'rgba(16,185,129,0.3)' },
  inactive:    { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' },
  attention:   { bg: 'rgba(245,158,11,0.15)',  color: '#fde68a', border: 'rgba(245,158,11,0.3)' },
  maintenance: { bg: 'rgba(245,158,11,0.15)',  color: '#fde68a', border: 'rgba(245,158,11,0.3)' },
  offline:     { bg: 'rgba(239,68,68,0.15)',   color: '#fca5a5', border: 'rgba(239,68,68,0.3)' },
  error:       { bg: 'rgba(239,68,68,0.15)',   color: '#fca5a5', border: 'rgba(239,68,68,0.3)' },
};

function assetIcon(name: string, kind: string): string {
  const n = name.toLowerCase();
  if (n.includes('ambulance')) return '🚑';
  if (n.includes('truck') || n.includes('lorry')) return '🚛';
  if (n.includes('van')) return '🚐';
  if (n.includes('bus')) return '🚌';
  if (n.includes('bike') || n.includes('motorcycle')) return '🏍️';
  if (kind === 'asset') return '🚗';
  return '📦';
}

function statusStyle(status?: string) {
  if (!status) return STATUS_COLORS['inactive'];
  const key = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_COLORS[key] || STATUS_COLORS['active'];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FleetCompanionPage() {
  const [assets, setAssets] = useState<AssetLocation[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noSnapshot, setNoSnapshot] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');

  useEffect(() => {
    const session = getSession();
    if (!session) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }
    setOrgAdmin(isOrgAdminRole(session.user.role));

    const slug = session.organization.slug;
    const token = getToken();

    // Resolve Pages API base (same-origin in production, :3100 in dev)
    const pagesBase =
      process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3100';

    fetch(`${pagesBase}/api/v1/orgs/${slug}/fleet/locations`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
        return data as FleetLocationsResponse;
      })
      .then((data) => {
        setAssets(data.assets ?? []);
        setTotal(data.total ?? data.assets?.length ?? 0);
        // If the endpoint returned empty assets with no error it means no snapshot yet
        setNoSnapshot((data.assets ?? []).length === 0);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load fleet');
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const attentionCount = assets.filter((a) =>
    ['attention', 'maintenance', 'offline', 'error'].includes((a.status || '').toLowerCase()),
  ).length;

  const allStatuses = ['all', ...new Set(assets.map((a) => a.status).filter(Boolean) as string[])];
  const allBranches = ['all', ...new Set(assets.map((a) => a.branchId).filter(Boolean) as string[])];

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      assets.filter((a) => {
        const blob = `${a.assetName} ${a.status || ''} ${a.branchId || ''}`.toLowerCase();
        const matchQ = !needle || blob.includes(needle);
        const matchStatus = statusFilter === 'all' || (a.status || '').toLowerCase() === statusFilter.toLowerCase();
        const matchBranch = branchFilter === 'all' || a.branchId === branchFilter;
        return matchQ && matchStatus && matchBranch;
      }),
    [assets, needle, statusFilter, branchFilter],
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mobile Work Companion · Fleet</p>
          <h1>Fleet &amp; asset status</h1>
          <p className={styles.lede}>
            Company vehicles and assets from connected Systems of Record. EIP observes and surfaces
            — it does not replace your fleet GPS or ERP.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.ghostBtn}>Connectors</Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className={styles.emptyCallout} role="alert">
          <div><strong>Error</strong><p>{error}</p></div>
        </div>
      ) : null}

      {/* KPI strip */}
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>Total assets</span>
          <strong>{loading ? '—' : total}</strong>
          <em>Fleet locations endpoint</em>
        </div>
        <div className={styles.kpi}>
          <span>Needing attention</span>
          <strong className={attentionCount > 0 ? styles.warn : undefined}>
            {loading ? '—' : attentionCount}
          </strong>
          <em>Maintenance / offline</em>
        </div>
        <div className={styles.kpi}>
          <span>With GPS</span>
          <strong>{loading ? '—' : assets.filter((a) => a.gps).length}</strong>
          <em>Live coordinates</em>
        </div>
        <div className={styles.kpi}>
          <span>Branches covered</span>
          <strong>{loading ? '—' : allBranches.length - 1 || '—'}</strong>
          <em>From SoR asset data</em>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0 0.75rem' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets…"
          aria-label="Search assets"
          style={{
            flex: '1 1 180px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            color: 'inherit',
            padding: '0.4rem 0.7rem',
            fontSize: '0.85rem',
          }}
        />
        {allStatuses.length > 1 ? (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
          >
            {allStatuses.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
          </select>
        ) : null}
        {allBranches.length > 1 ? (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            aria-label="Filter by branch"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
          >
            {allBranches.map((b) => <option key={b} value={b}>{b === 'all' ? 'All branches' : b}</option>)}
          </select>
        ) : null}
        {assets.length > 0 ? (
          <span style={{ color: 'var(--c-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>
            {filtered.length} of {assets.length}
          </span>
        ) : null}
      </div>

      {/* Asset grid */}
      {loading ? (
        <p className={styles.lede}>Loading fleet…</p>
      ) : noSnapshot && !error ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>No fleet data yet</strong>
            <p>
              Sync a connector that publishes UEM assets (fleet ERP, GPS feed, asset management
              system). Until then this companion stays ready without inventing vehicle data.
            </p>
          </div>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.ghostBtn}>Open Connectors</Link>
          ) : null}
        </div>
      ) : filtered.length === 0 && !error ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>{assets.length === 0 ? 'No assets in snapshot' : `No assets match "${query}"`}</strong>
            <p>
              {assets.length === 0
                ? 'Snapshot is live but no asset-type objects were found. Sync a fleet or asset management connector.'
                : 'Try clearing the search or changing filters.'}
            </p>
          </div>
        </div>
      ) : !error ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '0.65rem',
        }}>
          {filtered.map((asset) => {
            const st = statusStyle(asset.status);
            return (
              <article
                key={asset.assetId}
                className={styles.card}
                style={{ padding: '0.85rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}
              >
                <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }} aria-hidden>
                  {assetIcon(asset.assetName, asset.kind)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {asset.assetName}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    <span style={{
                      padding: '0.1rem 0.45rem',
                      borderRadius: 99,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      background: st.bg,
                      color: st.color,
                      border: `1px solid ${st.border}`,
                    }}>
                      {asset.status || 'unknown'}
                    </span>
                    <span style={{
                      padding: '0.1rem 0.45rem',
                      borderRadius: 99,
                      fontSize: '0.7rem',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--c-muted)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}>
                      {asset.kind}
                    </span>
                  </div>
                  {asset.branchId ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginTop: '0.3rem' }}>
                      📍 {asset.branchId}
                    </div>
                  ) : null}
                  {asset.gps ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                      {asset.gps.lat.toFixed(5)}, {asset.gps.lng.toFixed(5)}
                      {asset.gps.speedKph != null ? ` · ${asset.gps.speedKph} km/h` : ''}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <div className={styles.emptyCallout} style={{ marginTop: '1rem', background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)' }}>
        <div>
          <strong>Ask Ellinea about fleet</strong>
          <p>
            "Which assets need maintenance?" · "Show me fleet pressure from today's snapshot" ·
            "Summarize asset alerts across branches"
          </p>
        </div>
        <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
      </div>
    </div>
  );
}
