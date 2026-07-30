'use client';

import { getSession } from '@/lib/api';
import { useEffect, useState } from 'react';
import styles from '../command.module.css';

export default function SettingsPage() {
  const [email, setEmail] = useState('—');
  const [org, setOrg] = useState('—');
  const [role, setRole] = useState('—');

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setEmail(s.user.email);
    setOrg(s.organization.name);
    setRole(s.user.role);
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
        </p>
      </section>
    </div>
  );
}
