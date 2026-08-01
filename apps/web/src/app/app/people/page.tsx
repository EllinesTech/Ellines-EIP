'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  fetchEnterpriseSummary,
  getSession,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import styles from '../command.module.css';

function isPeopleObject(obj: { kind: string }) {
  return obj.kind === 'person' || obj.kind === 'user';
}

export default function PeopleCompanionPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [error, setError] = useState('');
  const [orgAdmin, setOrgAdmin] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s) setOrgAdmin(isOrgAdminRole(s.user.role));
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load people'));
  }, []);

  const synced = summary?.status === 'synced';
  const people = useMemo(() => {
    const objects = summary?.model?.objects || [];
    return objects.filter(isPeopleObject);
  }, [summary]);
  const peopleCount = summary?.model?.counts?.people ?? people.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mobile Work Companion</p>
          <h1>People directory</h1>
          <p className={styles.lede}>
            Read-only people and users from UEM / HR Systems of Record. Owner-scoped actions stay on
            Org Admin — this companion does not bypass SoR authority.
          </p>
        </div>
        <div className={styles.headerActions}>
          {orgAdmin ? (
            <Link href="/app/admin" className={styles.ghostBtn}>
              Org Admin
            </Link>
          ) : null}
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>People in model</span>
          <strong>{synced ? peopleCount : '—'}</strong>
          <em>From last connector sync</em>
        </div>
      </div>

      <section className={styles.card} style={{ marginTop: '1rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Directory</div>
            <h2 className={styles.cardTitle}>
              {synced
                ? people.length
                  ? `${people.length} people / users`
                  : 'No people objects in this snapshot yet'
                : 'Awaiting connector sync'}
            </h2>
          </div>
        </div>

        {!synced ? (
          <div className={styles.emptyCallout} style={{ marginTop: '0.85rem' }}>
            <strong>No people sync yet</strong>
            <p>
              Sync HR / SoR people into UEM to populate this register. Until then the page stays empty
              rather than inventing a directory.
            </p>
          </div>
        ) : null}

        {synced && !people.length ? (
          <div className={styles.emptyCallout} style={{ marginTop: '0.85rem' }}>
            <strong>Snapshot live — no person/user objects</strong>
            <p>Use Enterprise Search or Ask Ellinea once a people-capable connector is synced.</p>
          </div>
        ) : null}

        {people.length ? (
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {people.map((item) => (
              <li key={item.id}>
                <span className={styles.dot} />
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.kind}
                    {item.status ? ` · ${item.status}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.headerActions} style={{ marginTop: '1rem', justifyContent: 'flex-start' }}>
          <Link href="/app/search" className={styles.primaryLink}>
            Search enterprise →
          </Link>
          <Link href="/app/fleet" className={styles.primaryLink}>
            Fleet status →
          </Link>
        </div>
      </section>
    </div>
  );
}
