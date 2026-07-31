'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import {
  fetchEnterpriseSummary,
  getSession,
  listInstallations,
  type ConnectorInstallationDto,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import { isOrgAdminRole } from '@ellines-eip/shared';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

type Hit = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  href?: string;
};

function buildHits(
  q: string,
  summary: EnterpriseSummaryDto | null,
  installs: ConnectorInstallationDto[],
): Hit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits: Hit[] = [];

  if (summary) {
    if (
      summary.connectorName?.toLowerCase().includes(needle) ||
      summary.briefHighlight?.toLowerCase().includes(needle)
    ) {
      hits.push({
        id: 'summary',
        kind: 'snapshot',
        title: summary.connectorName || 'Enterprise snapshot',
        detail: summary.briefHighlight || 'Live enterprise summary',
        href: '/app',
      });
    }
    for (const [i, event] of (summary.timeline || []).entries()) {
      const blob = `${event.title} ${event.detail}`.toLowerCase();
      if (blob.includes(needle)) {
        hits.push({
          id: `event-${i}`,
          kind: 'timeline',
          title: event.title,
          detail: event.detail,
          href: '/app/timeline',
        });
      }
    }
    for (const obj of summary.model?.objects || []) {
      const blob = `${obj.kind} ${obj.name} ${obj.status || ''}`.toLowerCase();
      if (blob.includes(needle)) {
        hits.push({
          id: `obj-${obj.id}`,
          kind: obj.kind,
          title: obj.name,
          detail: obj.status ? `Status: ${obj.status}` : 'Universal Enterprise Model object',
          href: '/app',
        });
      }
    }
  }

  for (const inst of installs) {
    const blob = `${inst.displayName} ${inst.catalogId} ${inst.lastMessage || ''}`.toLowerCase();
    if (blob.includes(needle)) {
      hits.push({
        id: `inst-${inst.id}`,
        kind: 'connector',
        title: inst.displayName,
        detail: `${inst.catalogId} · ${inst.status}${inst.lastMessage ? ` · ${inst.lastMessage}` : ''}`,
        href: '/app/connectors',
      });
    }
  }

  return hits.slice(0, 40);
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('q') || '';
  const [query, setQuery] = useState(initial);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [installs, setInstalls] = useState<ConnectorInstallationDto[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setQuery(initial);
  }, [initial]);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setReady(true);
    const admin = isOrgAdminRole(s.user.role);
    Promise.all([
      fetchEnterpriseSummary().catch(() => null),
      admin ? listInstallations().catch(() => []) : Promise.resolve([]),
    ])
      .then(([sum, inst]) => {
        setSummary(sum);
        setInstalls(inst || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Search failed'));
  }, [router]);

  const hits = useMemo(() => buildHits(query, summary, installs), [query, summary, installs]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = query.trim();
    router.replace(next ? `/app/search/?q=${encodeURIComponent(next)}` : '/app/search/');
  }

  if (!ready) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Loading search…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Command Center</p>
          <h1>Enterprise Search</h1>
          <p className={styles.lede}>
            Find timeline events, UEM objects, and connector installs from the live enterprise
            snapshot.
          </p>
        </div>
      </header>

      <form className={adminStyles.form} onSubmit={onSubmit} style={{ marginBottom: '1rem' }}>
        <label style={{ gridColumn: '1 / -1' }}>
          Query
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Nairobi, approval, health, REST…"
            aria-label="Search query"
            autoFocus
          />
        </label>
        <button type="submit" className={adminStyles.primary}>
          Search
        </button>
      </form>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Results</div>
        {!query.trim() ? (
          <p className={styles.lede}>Type a term to search the connected enterprise model.</p>
        ) : hits.length === 0 ? (
          <p className={styles.lede}>No matches for “{query.trim()}”.</p>
        ) : (
          <ul className={styles.list} style={{ marginTop: '0.75rem' }}>
            {hits.map((hit) => (
              <li key={hit.id}>
                <span className={styles.uemKind}>{hit.kind}</span>
                <div>
                  <strong>{hit.title}</strong>
                  <p>{hit.detail}</p>
                  {hit.href ? (
                    <Link href={hit.href} className={styles.primaryLink}>
                      Open →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function EnterpriseSearchPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <p className={styles.lede}>Loading search…</p>
        </div>
      }
    >
      <SearchInner />
    </Suspense>
  );
}
