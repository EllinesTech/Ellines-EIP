'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  askEllineaApi,
  fetchEnterpriseSummary,
  fetchEllineaMemory,
  getSession,
  listOrgUsers,
  type EllineaMemoryNoteDto,
  type EnterpriseSummaryDto,
  type OrgMember,
} from '@/lib/api';
import styles from '../command.module.css';

type PersonRow = {
  id: string;
  name: string;
  role?: string;
  status?: string;
  kind: string;
  branch?: string;
  department?: string;
  email?: string;
  source: 'uem' | 'org';
  /** full OrgMember ref (org users only) */
  member?: OrgMember;
};

const ROLE_COLORS: Record<string, string> = {
  owner: '#c4b5fd',
  admin: '#93c5fd',
  executive: '#6ee7b7',
  manager: '#fde68a',
  member: '#94a3b8',
  viewer: '#64748b',
};

function avatarInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Contact detail modal */
function PersonModal({
  person,
  memory,
  role,
  onClose,
}: {
  person: PersonRow;
  memory: EllineaMemoryNoteDto[];
  role: string;
  onClose: () => void;
}) {
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  async function handleAsk() {
    setAiBusy(true); setAiText(''); setAiError('');
    try {
      const context =
        `Person: ${person.name}\nRole: ${person.role || 'unknown'}\n` +
        `Status: ${person.status || 'unknown'}\nSource: ${person.source === 'org' ? 'EIP org user' : 'SoR / UEM record'}\n` +
        `${person.email ? `Email: ${person.email}\n` : ''}` +
        `${person.branch ? `Branch: ${person.branch}\n` : ''}` +
        `${person.department ? `Department: ${person.department}\n` : ''}`;
      const res = await askEllineaApi({
        question: `Tell me what you know about ${person.name}'s role, activity, and any relevant enterprise context.`,
        summary: null,
        memory,
        templateAnswer: context,
        role,
      });
      setAiText(res.answer);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Contact details for ${person.name}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#1e293b', border: '1px solid rgba(124,58,237,0.35)',
        borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh',
        overflowY: 'auto', padding: '1.5rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: person.source === 'org' ? 'rgba(124,58,237,0.3)' : 'rgba(59,130,246,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '1rem',
            color: person.source === 'org' ? '#c4b5fd' : '#93c5fd',
            border: `1px solid ${person.source === 'org' ? 'rgba(124,58,237,0.4)' : 'rgba(59,130,246,0.35)'}`,
          }}>
            {avatarInitials(person.name)}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.05rem', fontWeight: 800 }}>{person.name}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
              {person.role && (
                <span style={{
                  padding: '0.1rem 0.5rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600,
                  background: 'rgba(255,255,255,0.07)',
                  color: ROLE_COLORS[person.role] || '#94a3b8',
                  border: `1px solid ${ROLE_COLORS[person.role] ? ROLE_COLORS[person.role] + '40' : 'rgba(255,255,255,0.15)'}`,
                }}>
                  {person.role}
                </span>
              )}
              <span style={{
                padding: '0.1rem 0.5rem', borderRadius: 99, fontSize: '0.72rem',
                background: person.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.2)',
                color: person.status === 'active' ? '#6ee7b7' : '#94a3b8',
                border: `1px solid ${person.status === 'active' ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.3)'}`,
              }}>
                {person.status || 'unknown'}
              </span>
              <span style={{
                padding: '0.1rem 0.5rem', borderRadius: 99, fontSize: '0.68rem',
                background: person.source === 'org' ? 'rgba(124,58,237,0.12)' : 'rgba(59,130,246,0.12)',
                color: person.source === 'org' ? '#c4b5fd' : '#93c5fd',
                border: `1px solid ${person.source === 'org' ? 'rgba(124,58,237,0.25)' : 'rgba(59,130,246,0.25)'}`,
              }}>
                {person.source === 'org' ? 'EIP user' : 'SoR / UEM'}
              </span>
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.2rem', flexShrink: 0 }}>
            ✕
          </button>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1.1rem' }}>
          {person.email && (
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.83rem' }}>
              <span style={{ color: 'var(--c-muted)', minWidth: 90 }}>Email</span>
              <a href={`mailto:${person.email}`} style={{ color: '#93c5fd', textDecoration: 'none' }}>{person.email}</a>
            </div>
          )}
          {person.branch && (
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.83rem' }}>
              <span style={{ color: 'var(--c-muted)', minWidth: 90 }}>Branch</span>
              <span style={{ color: '#e2e8f0' }}>{person.branch}</span>
            </div>
          )}
          {person.department && (
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.83rem' }}>
              <span style={{ color: 'var(--c-muted)', minWidth: 90 }}>Department</span>
              <span style={{ color: '#e2e8f0' }}>{person.department}</span>
            </div>
          )}
          {person.member?.createdAt && (
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.83rem' }}>
              <span style={{ color: 'var(--c-muted)', minWidth: 90 }}>Member since</span>
              <span style={{ color: '#e2e8f0' }}>{new Date(person.member.createdAt).toLocaleDateString()}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.83rem' }}>
            <span style={{ color: 'var(--c-muted)', minWidth: 90 }}>Source</span>
            <span style={{ color: '#e2e8f0' }}>
              {person.source === 'org' ? 'EIP organization user (identity)' : 'Connected SoR / UEM record'}
            </span>
          </div>
        </div>

        {/* Contact actions stub */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
          {person.email && (
            <a
              href={`mailto:${person.email}`}
              style={{ padding: '0.35rem 0.85rem', borderRadius: 6, background: 'rgba(37,99,235,0.18)', border: '1px solid rgba(37,99,235,0.35)', color: '#93c5fd', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' }}>
              ✉ Email
            </a>
          )}
          <span style={{ padding: '0.35rem 0.85rem', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--c-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'not-allowed', opacity: 0.7 }}
            title="Call — link your phone system connector to enable">
            📞 Call (stub)
          </span>
        </div>

        {/* Ellinea quick-ask section */}
        <div style={{ padding: '0.85rem', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 9 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4b5fd', marginBottom: '0.5rem' }}>
            ✦ Ask Ellinea about {person.name.split(' ')[0]}
          </div>
          {aiError && <p style={{ color: '#fca5a5', fontSize: '0.8rem', marginBottom: '0.4rem' }}>{aiError}</p>}
          {aiText ? (
            <div>
              <p style={{ fontSize: '0.82rem', color: '#e2e8f0', whiteSpace: 'pre-line', lineHeight: 1.6, marginBottom: '0.5rem' }}>{aiText}</p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setAiText('')}
                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'var(--c-muted)', padding: '0.15rem 0.5rem', cursor: 'pointer', fontSize: '0.72rem' }}>
                  Clear
                </button>
                <Link href="/app/ellinea" style={{ background: 'transparent', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 5, color: '#c4b5fd', padding: '0.15rem 0.5rem', fontSize: '0.72rem', textDecoration: 'none' }}>
                  Open Ask workspace →
                </Link>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => void handleAsk()} disabled={aiBusy} className={styles.aiBtn}
              style={{ fontSize: '0.8rem' }}>
              {aiBusy ? '⟳ Asking Ellinea…' : `✦ Ask about ${person.name.split(' ')[0]}'s activity`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PeopleCompanionPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrgMember[]>([]);
  const [memory, setMemory] = useState<EllineaMemoryNoteDto[]>([]);
  const [error, setError] = useState('');
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [userRole, setUserRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'org' | 'uem'>('all');
  const [selectedPerson, setSelectedPerson] = useState<PersonRow | null>(null);

  useEffect(() => {
    const s = getSession();
    const isAdmin = s ? isOrgAdminRole(s.user.role) : false;
    setOrgAdmin(isAdmin);
    if (s) setUserRole(s.user.role);

    Promise.all([
      fetchEnterpriseSummary().catch(() => null),
      isAdmin ? listOrgUsers().catch(() => [] as OrgMember[]) : Promise.resolve([] as OrgMember[]),
      fetchEllineaMemory().catch(() => [] as EllineaMemoryNoteDto[]),
    ])
      .then(([snap, users, mem]) => {
        setSummary(snap);
        setOrgUsers(users);
        setMemory(mem);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load people'))
      .finally(() => setLoading(false));
  }, []);

  const synced = summary?.status === 'synced';

  // Merge UEM objects + org users into a unified directory
  const people = useMemo((): PersonRow[] => {
    const rows: PersonRow[] = [];

    // Org users (EIP-native)
    for (const u of orgUsers) {
      rows.push({
        id: `org-${u.id}`,
        name: u.fullName,
        role: u.role,
        status: u.isActive ? 'active' : 'inactive',
        kind: 'person',
        email: u.email,
        source: 'org',
        member: u,
      });
    }

    // UEM objects from connector sync (deduplicate by name)
    for (const obj of summary?.model?.objects ?? []) {
      if (obj.kind !== 'person' && obj.kind !== 'user') continue;
      if (rows.some((r) => r.source === 'org' && r.name.toLowerCase() === obj.name.toLowerCase()))
        continue;
      rows.push({
        id: `uem-${obj.id}`,
        name: obj.name,
        status: obj.status,
        kind: obj.kind,
        branch: obj.branchId,
        source: 'uem',
      });
    }

    return rows;
  }, [orgUsers, summary]);

  const allRoles = ['all', ...new Set(people.map((p) => p.role).filter(Boolean) as string[])];
  const allStatuses = ['all', ...new Set(people.map((p) => p.status).filter(Boolean) as string[])];

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      people.filter((p) => {
        const blob = `${p.name} ${p.email || ''} ${p.role || ''} ${p.status || ''} ${p.branch || ''}`.toLowerCase();
        const matchQ = !needle || blob.includes(needle);
        const matchRole = roleFilter === 'all' || p.role === roleFilter;
        const matchStatus = statusFilter === 'all' || p.status === statusFilter;
        const matchSource = sourceFilter === 'all' || p.source === sourceFilter;
        return matchQ && matchRole && matchStatus && matchSource;
      }),
    [people, needle, roleFilter, statusFilter, sourceFilter],
  );

  const activeCount = people.filter((p) => p.status === 'active').length;
  const inactiveCount = people.filter((p) => p.status === 'inactive').length;
  const uemCount = people.filter((p) => p.source === 'uem').length;

  return (
    <div className={styles.page}>
      {/* Contact modal */}
      {selectedPerson && (
        <PersonModal
          person={selectedPerson}
          memory={memory}
          role={userRole}
          onClose={() => setSelectedPerson(null)}
        />
      )}

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mobile Work Companion · People</p>
          <h1>People directory</h1>
          <p className={styles.lede}>
            Unified read-only directory from EIP org users and connected HR / SoR systems. Owner
            actions stay in Org Admin — this companion wraps and surfaces, not modifies.
          </p>
        </div>
        <div className={styles.headerActions}>
          {orgAdmin ? (
            <Link href="/app/admin" className={styles.ghostBtn}>
              Manage users
            </Link>
          ) : null}
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
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
          <span>Total people</span>
          <strong>{loading ? '—' : people.length}</strong>
          <em>EIP + SoR combined</em>
        </div>
        <div className={styles.kpi}>
          <span>Active</span>
          <strong className={styles.pos}>{loading ? '—' : activeCount}</strong>
          <em>Status: active</em>
        </div>
        <div className={styles.kpi}>
          <span>Inactive</span>
          <strong>{loading ? '—' : inactiveCount}</strong>
          <em>Status: inactive</em>
        </div>
        <div className={styles.kpi}>
          <span>From connectors</span>
          <strong>{loading ? '—' : uemCount}</strong>
          <em>UEM / SoR objects</em>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0 0.75rem' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, role, email…"
          aria-label="Search people"
          style={{
            flex: '1 1 200px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            color: 'inherit',
            padding: '0.4rem 0.7rem',
            fontSize: '0.85rem',
          }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
        >
          {allRoles.map((r) => (
            <option key={r} value={r} style={{ background: '#1e293b', color: '#f1f5f9' }}>{r === 'all' ? 'All roles' : r}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
        >
          {allStatuses.map((s) => (
            <option key={s} value={s} style={{ background: '#1e293b', color: '#f1f5f9' }}>{s === 'all' ? 'All statuses' : s}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
          aria-label="Filter by source"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
        >
          <option value="all" style={{ background: '#1e293b', color: '#f1f5f9' }}>All sources</option>
          <option value="org" style={{ background: '#1e293b', color: '#f1f5f9' }}>EIP org users</option>
          <option value="uem" style={{ background: '#1e293b', color: '#f1f5f9' }}>SoR / UEM</option>
        </select>
        <span style={{ color: 'var(--c-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>
          {filtered.length} of {people.length}
        </span>
      </div>

      {/* Directory */}
      {loading ? (
        <p className={styles.lede}>Loading directory…</p>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>{people.length === 0 ? 'No people yet' : `No matches for "${query}"`}</strong>
            <p>
              {people.length === 0
                ? orgAdmin
                  ? 'Invite users from Org Admin, or sync an HR / SoR connector to populate the directory.'
                  : 'Your IT Admin can invite users or sync an HR system.'
                : 'Try a different search term or clear the filters.'}
            </p>
          </div>
          {orgAdmin ? (
            <Link href="/app/admin" className={styles.aiBtn}>Invite users</Link>
          ) : null}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '0.65rem',
        }}>
          {filtered.map((person) => (
            <article
              key={person.id}
              className={styles.card}
              role="button"
              tabIndex={0}
              aria-label={`View contact details for ${person.name}`}
              onClick={() => setSelectedPerson(person)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPerson(person); } }}
              style={{ padding: '0.85rem 1rem', display: 'flex', gap: '0.85rem', alignItems: 'flex-start', cursor: 'pointer' }}
            >
              {/* Avatar */}
              <div
                aria-hidden
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: person.source === 'org' ? 'rgba(124,58,237,0.3)' : 'rgba(59,130,246,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  flexShrink: 0,
                  color: person.source === 'org' ? '#c4b5fd' : '#93c5fd',
                  border: `1px solid ${person.source === 'org' ? 'rgba(124,58,237,0.35)' : 'rgba(59,130,246,0.3)'}`,
                }}
              >
                {avatarInitials(person.name)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {person.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                  {person.role ? (
                    <span style={{
                      padding: '0.1rem 0.4rem',
                      borderRadius: 99,
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      background: 'rgba(255,255,255,0.07)',
                      color: ROLE_COLORS[person.role] || '#94a3b8',
                      border: `1px solid ${ROLE_COLORS[person.role] ? ROLE_COLORS[person.role] + '40' : 'rgba(255,255,255,0.15)'}`,
                    }}>
                      {person.role}
                    </span>
                  ) : null}
                  <span style={{
                    padding: '0.1rem 0.4rem',
                    borderRadius: 99,
                    fontSize: '0.68rem',
                    background: person.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.2)',
                    color: person.status === 'active' ? '#6ee7b7' : '#94a3b8',
                    border: `1px solid ${person.status === 'active' ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.3)'}`,
                  }}>
                    {person.status || 'unknown'}
                  </span>
                  <span style={{
                    padding: '0.1rem 0.4rem',
                    borderRadius: 99,
                    fontSize: '0.65rem',
                    background: person.source === 'org' ? 'rgba(124,58,237,0.12)' : 'rgba(59,130,246,0.12)',
                    color: person.source === 'org' ? '#c4b5fd' : '#93c5fd',
                    border: `1px solid ${person.source === 'org' ? 'rgba(124,58,237,0.25)' : 'rgba(59,130,246,0.25)'}`,
                  }}>
                    {person.source === 'org' ? 'EIP' : 'SoR'}
                  </span>
                </div>
                {person.email ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginTop: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {person.email}
                  </div>
                ) : null}
                {person.branch ? (
                  <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginTop: '0.1rem' }}>
                    Branch: {person.branch}
                  </div>
                ) : null}
                <div style={{ fontSize: '0.68rem', color: 'rgba(124,58,237,0.7)', marginTop: '0.3rem', fontWeight: 600 }}>
                  Click for details →
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!synced && !loading && orgUsers.length === 0 ? (
        <div className={styles.emptyCallout} style={{ marginTop: '1rem' }}>
          <div>
            <strong>Connect an HR / people system</strong>
            <p>
              Sync a connector with people data to enrich this directory with SoR employees,
              patients, or clients. EIP wraps and surfaces — it does not become a new HR system.
            </p>
          </div>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.ghostBtn}>Open Connectors</Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
