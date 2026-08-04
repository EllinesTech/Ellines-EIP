'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { formatOrgDateTime } from '@ellines-eip/shared';
import {
  DATETIME_PREFS_EVENT,
  fetchEnterpriseSummary,
  getSession,
  listApprovals,
  listEnterpriseEvents,
  listOrgAuditLogs,
  readCachedOrgDateTimeSettings,
  type ApprovalRequestDto,
  type AuditLogDto,
  type EnterpriseSummaryDto,
  type OrgDateTimeSettingsDto,
} from '@/lib/api';
import styles from '../command.module.css';

type FeedKind = 'connector' | 'approval' | 'event' | 'audit' | 'system';

type FeedItem = {
  id: string;
  kind: FeedKind;
  title: string;
  detail: string;
  at: string | null;
  href?: string;
};

const KIND_META: Record<FeedKind, { label: string; color: string; dot: string }> = {
  connector: { label: 'Connector', color: '#60a5fa', dot: '#3b82f6' },
  approval:  { label: 'Approval',  color: '#fbbf24', dot: '#f59e0b' },
  event:     { label: 'Event',     color: '#a78bfa', dot: '#8b5cf6' },
  audit:     { label: 'Audit',     color: '#94a3b8', dot: '#64748b' },
  system:    { label: 'System',    color: '#6ee7b7', dot: '#10b981' },
};

function formatWhen(
  iso: string | null | undefined,
  prefs: OrgDateTimeSettingsDto,
): string {
  if (!iso) return '—';
  try {
    const f = formatOrgDateTime(new Date(iso), prefs);
    return `${f.day} · ${f.time}`;
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function buildFeed(
  summary: EnterpriseSummaryDto | null,
  approvals: ApprovalRequestDto[],
  events: { id: string; type: string; payload: Record<string, unknown>; at: string }[],
  audit: AuditLogDto[],
): FeedItem[] {
  const items: FeedItem[] = [];

  // Connector timeline events
  if (summary?.status === 'synced') {
    for (const [i, ev] of (summary.timeline || []).entries()) {
      items.push({
        id: `connector-${i}-${ev.title}`,
        kind: 'connector',
        title: ev.title,
        detail: ev.detail,
        at: summary.syncedAt
          ? new Date(new Date(summary.syncedAt).getTime() - i * 90_000).toISOString()
          : null,
        href: '/app/connectors',
      });
    }
    // Sync event itself
    items.push({
      id: `sync-${summary.connectorId}-${summary.syncedAt}`,
      kind: 'connector',
      title: `Synced — ${summary.connectorName}`,
      detail: `Health ${summary.healthScore} · ${summary.connectedSystems} system(s) · ${summary.openAlerts} alert(s)`,
      at: summary.syncedAt,
      href: '/app/connectors',
    });
  }

  // Approvals (most recent 20)
  for (const appr of approvals.slice(0, 20)) {
    if (appr.status !== 'pending') {
      items.push({
        id: `appr-${appr.id}`,
        kind: 'approval',
        title: `Approval ${appr.status}: ${appr.title}`,
        detail: `${appr.requester} · decided by ${appr.decidedBy || '—'}`,
        at: appr.decidedAt || appr.createdAt,
        href: '/app/approvals',
      });
    } else {
      items.push({
        id: `appr-pending-${appr.id}`,
        kind: 'approval',
        title: `Approval pending: ${appr.title}`,
        detail: `Requested by ${appr.requester} · step ${appr.currentStepIndex + 1}/${appr.steps.length}`,
        at: appr.createdAt,
        href: '/app/approvals',
      });
    }
  }

  // Enterprise events bus
  for (const ev of events.slice(0, 30)) {
    items.push({
      id: `evt-${ev.id}`,
      kind: 'event',
      title: ev.type.replace(/\./g, ' · '),
      detail: Object.entries(ev.payload || {})
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
        .join(' · ') || 'Event fired',
      at: ev.at,
    });
  }

  // Audit log (top 20)
  for (const log of audit.slice(0, 20)) {
    items.push({
      id: `audit-${log.id}`,
      kind: 'audit',
      title: log.action.replace(/\./g, ' · '),
      detail: `${log.resource || 'system'} · ${log.actorEmail || log.actorName || 'system'}`,
      at: log.createdAt,
      href: '/app/audit',
    });
  }

  // Sort newest first
  items.sort((a, b) => {
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at > b.at ? -1 : 1;
  });

  return items;
}

export default function EnterpriseTimelinePage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequestDto[]>([]);
  const [events, setEvents] = useState<{ id: string; type: string; payload: Record<string, unknown>; at: string }[]>([]);
  const [audit, setAudit] = useState<AuditLogDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<FeedKind | 'all'>('all');
  const [prefs, setPrefs] = useState<OrgDateTimeSettingsDto>({ timeFormat: '12h', dateStyle: 'short' });

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    const cached = readCachedOrgDateTimeSettings(s.organization.id);
    if (cached) setPrefs(cached);
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent<{ orgId: string; settings: OrgDateTimeSettingsDto }>).detail;
      if (detail?.settings) setPrefs(detail.settings);
    };
    window.addEventListener(DATETIME_PREFS_EVENT, onPrefs);

    Promise.all([
      fetchEnterpriseSummary().catch(() => null),
      listApprovals().catch(() => [] as ApprovalRequestDto[]),
      listEnterpriseEvents(50).catch(() => [] as { id: string; type: string; payload: Record<string, unknown>; at: string }[]),
      listOrgAuditLogs(30).catch(() => [] as AuditLogDto[]),
    ])
      .then(([snap, appr, evts, aud]) => {
        setSummary(snap);
        setApprovals(appr);
        setEvents(evts as typeof events);
        setAudit(aud);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load timeline'))
      .finally(() => setLoading(false));

    return () => window.removeEventListener(DATETIME_PREFS_EVENT, onPrefs);
  }, []);

  const allFeed = useMemo(
    () => buildFeed(summary, approvals, events, audit),
    [summary, approvals, events, audit],
  );

  const filtered = kindFilter === 'all' ? allFeed : allFeed.filter((i) => i.kind === kindFilter);

  const kindCounts = allFeed.reduce<Partial<Record<FeedKind, number>>>((acc, i) => {
    acc[i.kind] = (acc[i.kind] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Command Center</p>
          <h1>Enterprise Timeline</h1>
          <p className={styles.lede}>
            Combined chronological feed — connector events, approval decisions, enterprise events, and
            audit actions in one unified view.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/approvals" className={styles.ghostBtn}>Approvals</Link>
          <Link href="/app/audit" className={styles.ghostBtn}>Audit Center</Link>
          <Link href="/app/connectors" className={styles.ghostBtn}>Connectors</Link>
        </div>
      </header>

      {error ? <p className={styles.lede} style={{ color: '#f87171' }}>{error}</p> : null}

      {/* Kind filter tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.85rem' }}>
        {(['all', 'connector', 'approval', 'event', 'audit', 'system'] as const).map((k) => {
          const count = k === 'all' ? allFeed.length : (kindCounts[k as FeedKind] || 0);
          if (k !== 'all' && count === 0) return null;
          const meta = k !== 'all' ? KIND_META[k as FeedKind] : null;
          const active = kindFilter === k;
          // Use hex colors from KIND_META; convert to rgba for alpha backgrounds
          // so browsers don't fall back to UA white on unsupported 8-digit hex
          const activeColor = meta?.color || '#a78bfa';
          // Parse the hex color into r,g,b for rgba() usage
          const hex = activeColor.replace('#', '');
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              style={{
                padding: '0.2rem 0.7rem',
                borderRadius: 99,
                border: `1px solid ${active ? activeColor : 'rgba(255,255,255,0.1)'}`,
                background: active ? `rgba(${r},${g},${b},0.15)` : 'transparent',
                color: active ? activeColor : '#8b95a8',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              {k === 'all' ? 'All' : (meta?.label || k)} ({count})
            </button>
          );
        })}
      </div>

      <section className={styles.timeline}>
        {loading ? (
          <p className={styles.lede}>Loading timeline…</p>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyCallout}>
            <div>
              <strong>Nothing in this feed yet</strong>
              <p>
                {allFeed.length === 0
                  ? 'Sync a connector, create an approval, or fire an event to populate the timeline.'
                  : `No ${kindFilter} items — try switching the filter.`}
              </p>
            </div>
            <Link href="/app/connectors" className={styles.ghostBtn}>Open Connectors</Link>
          </div>
        ) : (
          <ul className={styles.events} style={{ marginTop: '0.5rem' }}>
            {filtered.map((item) => {
              const meta = KIND_META[item.kind];
              return (
                <li key={item.id}>
                  <span
                    className={styles.rail}
                    style={{ background: meta.dot }}
                    aria-hidden
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.65rem', alignItems: 'baseline', marginBottom: '0.15rem' }}>
                      <span style={{
                        padding: '0.1rem 0.4rem',
                        borderRadius: 99,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        background: meta.color + '22',
                        color: meta.color,
                        border: `1px solid ${meta.color}44`,
                      }}>
                        {meta.label}
                      </span>
                      <strong style={{ fontSize: '0.88rem' }}>{item.title}</strong>
                      <span className={styles.time}>{formatWhen(item.at, prefs)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>{item.detail}</p>
                    {item.href ? (
                      <Link href={item.href} className={styles.primaryLink} style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'inline-block' }}>
                        Open →
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!loading && allFeed.length > 0 ? (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
          <span>{allFeed.length} total events</span>
          <span>·</span>
          {(Object.entries(kindCounts) as [FeedKind, number][]).map(([k, c]) => (
            <span key={k}>{KIND_META[k]?.label || k}: {c}</span>
          )).reduce<JSX.Element[]>((acc, el, i) => {
            if (i > 0) acc.push(<span key={`dot-${i}`}>·</span>);
            acc.push(el);
            return acc;
          }, [])}
        </div>
      ) : null}
    </div>
  );
}
