'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchEnterpriseSummary,
  fetchEllineaMemory,
  listApprovals,
  listOrgAuditLogs,
  listOrgUsers,
  getSession,
  listInstallations,
  type ConnectorInstallationDto,
  type EnterpriseSummaryDto,
  type EllineaMemoryNoteDto,
  type ApprovalRequestDto,
  type AuditLogDto,
  type OrgMember,
} from '@/lib/api';
import { isOrgAdminRole } from '@ellines-eip/shared';
import styles from '../command.module.css';

type HitKind =
  | 'snapshot' | 'timeline' | 'object' | 'connector' | 'memory'
  | 'approval' | 'audit' | 'person';

type Hit = {
  id: string;
  kind: HitKind;
  title: string;
  detail: string;
  meta?: string;
  href?: string;
  score: number;
};

const KIND_LABEL: Record<HitKind, string> = {
  snapshot:  'Snapshot',
  timeline:  'Timeline',
  object:    'UEM Object',
  connector: 'Connector',
  memory:    'Memory',
  approval:  'Approval',
  audit:     'Audit',
  person:    'Person',
};

const KIND_COLORS: Record<HitKind, string> = {
  snapshot:  '#93c5fd',
  timeline:  '#c4b5fd',
  object:    '#6ee7b7',
  connector: '#fde68a',
  memory:    '#f0abfc',
  approval:  '#fdba74',
  audit:     '#94a3b8',
  person:    '#67e8f9',
};

function score(blob: string, needle: string): number {
  const n = needle.toLowerCase();
  const b = blob.toLowerCase();
  if (!b.includes(n)) return 0;
  // Exact title match scores higher
  if (b.startsWith(n)) return 3;
  const wordMatch = new RegExp(`\\b${n}\\b`).test(b);
  return wordMatch ? 2 : 1;
}

function buildHits(
  q: string,
  summary: EnterpriseSummaryDto | null,
  installs: ConnectorInstallationDto[],
  memory: EllineaMemoryNoteDto[],
  approvals: ApprovalRequestDto[],
  audit: AuditLogDto[],
  users: OrgMember[],
): Hit[] {
  const needle = q.trim().toLowerCase();
  if (!needle || needle.length < 2) return [];
  const hits: Hit[] = [];

  // Enterprise snapshot
  if (summary) {
    const sBlob = `${summary.connectorName} ${summary.briefHighlight}`;
    const s = score(sBlob, needle);
    if (s > 0) {
      hits.push({ id: 'snapshot', kind: 'snapshot', title: summary.connectorName || 'Enterprise snapshot', detail: summary.briefHighlight || 'Live enterprise summary', href: '/app', score: s });
    }
    for (const [i, ev] of (summary.timeline || []).entries()) {
      const s2 = score(`${ev.title} ${ev.detail}`, needle);
      if (s2 > 0) hits.push({ id: `tl-${i}`, kind: 'timeline', title: ev.title, detail: ev.detail, href: '/app/timeline', score: s2 });
    }
    for (const obj of summary.model?.objects || []) {
      const s3 = score(`${obj.kind} ${obj.name} ${obj.status || ''}`, needle);
      if (s3 > 0) hits.push({ id: `obj-${obj.id}`, kind: 'object', title: obj.name, detail: `${obj.kind}${obj.status ? ` · ${obj.status}` : ''}`, href: '/app/org-system', score: s3 });
    }
  }

  // Connectors
  for (const inst of installs) {
    const s = score(`${inst.displayName} ${inst.catalogId} ${inst.lastMessage || ''}`, needle);
    if (s > 0) hits.push({ id: `inst-${inst.id}`, kind: 'connector', title: inst.displayName, detail: `${inst.catalogId} · ${inst.status}`, meta: inst.lastMessage || undefined, href: '/app/connectors', score: s });
  }

  // Enterprise Memory
  for (const note of memory) {
    const s = score(`${note.title} ${note.body}`, needle);
    if (s > 0) hits.push({ id: `mem-${note.id}`, kind: 'memory', title: note.title, detail: note.body.slice(0, 120), href: '/app/ellinea', score: s + 1 /* boost */ });
  }

  // Approvals
  for (const appr of approvals) {
    const s = score(`${appr.title} ${appr.detail} ${appr.requester} ${appr.status}`, needle);
    if (s > 0) hits.push({ id: `appr-${appr.id}`, kind: 'approval', title: appr.title, detail: `${appr.status} · requested by ${appr.requester}`, meta: appr.createdAt, href: '/app/approvals', score: s });
  }

  // Audit log
  for (const log of audit.slice(0, 50)) {
    const blob = `${log.action} ${log.resource || ''} ${log.actorEmail || ''} ${log.actorName || ''} ${JSON.stringify(log.metadata || {})}`;
    const s = score(blob, needle);
    if (s > 0) hits.push({ id: `audit-${log.id}`, kind: 'audit', title: log.action, detail: `${log.resource || 'system'} · ${log.actorEmail || log.actorName || 'system'}`, meta: log.createdAt, href: '/app/audit', score: s });
  }

  // Org users
  for (const u of users) {
    const s = score(`${u.fullName} ${u.email} ${u.role}`, needle);
    if (s > 0) hits.push({ id: `usr-${u.id}`, kind: 'person', title: u.fullName, detail: `${u.role} · ${u.email}`, href: '/app/people', score: s + 1 /* boost */ });
  }

  // Sort: highest score first, then by kind priority
  const kindPriority: Record<HitKind, number> = { person: 7, memory: 6, approval: 5, snapshot: 4, object: 3, timeline: 2, connector: 1, audit: 0 };
  hits.sort((a, b) => b.score - a.score || (kindPriority[b.kind] || 0) - (kindPriority[a.kind] || 0));
  return hits.slice(0, 60);
}

const RECENT_KEY = 'eip_recent_searches';
function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 8); } catch { return []; }
}
function addRecent(q: string) {
  const prev = readRecent().filter((r) => r !== q);
  localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, 8)));
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('q') || '';
  const [query, setQuery] = useState(initial);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [installs, setInstalls] = useState<ConnectorInstallationDto[]>([]);
  const [memory, setMemory] = useState<EllineaMemoryNoteDto[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequestDto[]>([]);
  const [audit, setAudit] = useState<AuditLogDto[]>([]);
  const [users, setUsers] = useState<OrgMember[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<HitKind | 'all'>('all');
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(initial);
  }, [initial]);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    setRecent(readRecent());
    const admin = isOrgAdminRole(s.user.role);

    Promise.all([
      fetchEnterpriseSummary().catch(() => null),
      admin ? listInstallations().catch(() => [] as ConnectorInstallationDto[]) : Promise.resolve([] as ConnectorInstallationDto[]),
      fetchEllineaMemory().catch(() => [] as EllineaMemoryNoteDto[]),
      admin ? listApprovals().catch(() => [] as ApprovalRequestDto[]) : Promise.resolve([] as ApprovalRequestDto[]),
      admin ? listOrgAuditLogs(50).catch(() => [] as AuditLogDto[]) : Promise.resolve([] as AuditLogDto[]),
      listOrgUsers().catch(() => [] as OrgMember[]),
    ])
      .then(([sum, inst, mem, appr, aud, usrs]) => {
        setSummary(sum);
        setInstalls(inst);
        setMemory(mem);
        setApprovals(appr);
        setAudit(aud);
        setUsers(usrs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Search failed'))
      .finally(() => { setLoading(false); setTimeout(() => inputRef.current?.focus(), 80); });
  }, [router]);

  const hits = useMemo(
    () => buildHits(query, summary, installs, memory, approvals, audit, users),
    [query, summary, installs, memory, approvals, audit, users],
  );

  const filteredHits = kindFilter === 'all' ? hits : hits.filter((h) => h.kind === kindFilter);
  const kindCounts = hits.reduce<Partial<Record<HitKind, number>>>((acc, h) => {
    acc[h.kind] = (acc[h.kind] || 0) + 1;
    return acc;
  }, {});
  const kindsPresent = (Object.keys(kindCounts) as HitKind[]).sort(
    (a, b) => (kindCounts[b] || 0) - (kindCounts[a] || 0),
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = query.trim();
    if (next.length >= 2) addRecent(next);
    setRecent(readRecent());
    router.replace(next ? `/app/search/?q=${encodeURIComponent(next)}` : '/app/search/');
  }

  function useRecent(r: string) {
    setQuery(r);
    router.replace(`/app/search/?q=${encodeURIComponent(r)}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Command Center</p>
          <h1>Enterprise Search</h1>
          <p className={styles.lede}>
            Search across UEM objects, people, connectors, Memory notes, approvals, and audit logs.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
        </div>
      </header>

      {/* Search input */}
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, assets, approvals, memory, connectors…"
          aria-label="Enterprise search"
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            color: 'inherit',
            padding: '0.55rem 0.9rem',
            fontSize: '0.95rem',
            outline: 'none',
          }}
          autoComplete="off"
        />
        <button
          type="submit"
          style={{
            background: 'rgba(124,58,237,0.85)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            padding: '0.55rem 1.1rem',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.88rem',
          }}
        >
          Search
        </button>
      </form>

      {error ? <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p> : null}

      {/* Recent searches */}
      {!query.trim() && recent.length > 0 ? (
        <div style={{ marginBottom: '1rem' }}>
          <div className={styles.panelLabel} style={{ marginBottom: '0.4rem' }}>Recent searches</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => useRecent(r)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 99,
                  color: '#c5cddb',
                  padding: '0.2rem 0.65rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Kind filters */}
      {hits.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setKindFilter('all')}
            style={{
              padding: '0.2rem 0.65rem',
              borderRadius: 99,
              border: `1px solid ${kindFilter === 'all' ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)'}`,
              background: kindFilter === 'all' ? 'rgba(124,58,237,0.2)' : 'transparent',
              color: kindFilter === 'all' ? '#c4b5fd' : 'var(--c-muted)',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            All ({hits.length})
          </button>
          {kindsPresent.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              style={{
                padding: '0.2rem 0.65rem',
                borderRadius: 99,
                border: `1px solid ${kindFilter === k ? KIND_COLORS[k] + '80' : 'rgba(255,255,255,0.1)'}`,
                background: kindFilter === k ? KIND_COLORS[k] + '22' : 'transparent',
                color: kindFilter === k ? KIND_COLORS[k] : 'var(--c-muted)',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              {KIND_LABEL[k]} ({kindCounts[k]})
            </button>
          ))}
        </div>
      ) : null}

      {/* Results */}
      {loading ? (
        <p className={styles.lede}>Loading search index…</p>
      ) : !query.trim() ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>Search the enterprise</strong>
            <p>Try: a person's name, an asset type, an approval title, a connector name, or a memory note keyword.</p>
          </div>
        </div>
      ) : filteredHits.length === 0 ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>No results for "{query.trim()}"</strong>
            <p>Try a broader term, or Ask Ellinea if this is a complex question about enterprise data.</p>
          </div>
          <Link href={`/app/ellinea`} className={styles.ghostBtn}>Ask Ellinea</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {filteredHits.map((hit) => (
            <article
              key={hit.id}
              className={styles.card}
              style={{ padding: '0.7rem 0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}
            >
              <span
                style={{
                  padding: '0.15rem 0.45rem',
                  borderRadius: 99,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  background: KIND_COLORS[hit.kind] + '22',
                  color: KIND_COLORS[hit.kind],
                  border: `1px solid ${KIND_COLORS[hit.kind]}44`,
                  flexShrink: 0,
                  marginTop: '0.15rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {KIND_LABEL[hit.kind]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                  {hit.href ? (
                    <Link href={hit.href} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {hit.title}
                    </Link>
                  ) : hit.title}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {hit.detail}
                </div>
                {hit.meta ? (
                  <div style={{ fontSize: '0.7rem', color: 'var(--c-muted)', marginTop: '0.15rem', opacity: 0.7 }}>
                    {hit.meta.length > 30 ? new Date(hit.meta).toLocaleString() : hit.meta}
                  </div>
                ) : null}
              </div>
              {hit.href ? (
                <Link
                  href={hit.href}
                  style={{ color: 'var(--c-blue)', fontSize: '0.78rem', flexShrink: 0, alignSelf: 'center', textDecoration: 'none' }}
                >
                  Open →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {/* Ask Ellinea shortcut */}
      {query.trim() && hits.length > 0 ? (
        <div className={styles.emptyCallout} style={{ marginTop: '1rem', background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.3)' }}>
          <div>
            <strong>Want a smarter answer?</strong>
            <p>Ask Ellinea about "{query.trim()}" for enterprise-context reasoning, not just search results.</p>
          </div>
          <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea →</Link>
        </div>
      ) : null}
    </div>
  );
}

export default function EnterpriseSearchPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#8b95a8' }}>Loading search…</div>}>
      <SearchInner />
    </Suspense>
  );
}
