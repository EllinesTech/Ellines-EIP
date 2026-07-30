'use client';

import Link from 'next/link';
import { getSession } from '@/lib/api';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useEffect, useState } from 'react';
import styles from '../command.module.css';

export default function SettingsPage() {
  const [email, setEmail] = useState('—');
  const [org, setOrg] = useState('—');
  const [role, setRole] = useState('—');
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setEmail(s.user.email);
    setOrg(s.organization.name);
    setRole(s.user.role);
    setOrgAdmin(isOrgAdminRole(s.user.role));
    setPlatformAdmin(Boolean(s.isPlatformAdmin));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workspace</p>
          <h1>Settings</h1>
          <p className={styles.lede}>Your profile for this Ellines EIP organization.</p>
        </div>
      </header>
      <section className={styles.brief}>
        <div className={styles.panelLabel}>Account</div>
        <p suppressHydrationWarning>
          <strong>Organization:</strong> {org}
        </p>
        <p suppressHydrationWarning>
          <strong>Email:</strong> {email}
        </p>
        <p suppressHydrationWarning>
          <strong>Role:</strong> {role}
          {platformAdmin ? ' · platform operator' : ''}
        </p>
        {orgAdmin ? (
          <p>
            <Link href="/app/admin" className={styles.primaryLink}>
              Open IT Admin (users &amp; rights) →
            </Link>
          </p>
        ) : null}
        {platformAdmin ? (
          <p>
            <Link href="/app/platform" className={styles.primaryLink}>
              Open Platform Super Admin →
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
