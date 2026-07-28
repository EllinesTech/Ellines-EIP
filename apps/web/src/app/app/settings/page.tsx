'use client';

import { getSession } from '@/lib/api';
import { useEffect, useState } from 'react';
import styles from '../command.module.css';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [role, setRole] = useState('');

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
        <h1>Settings</h1>
        <p>Your workspace profile for this Ellines EIP organization.</p>
      </header>
      <section className={styles.panel}>
        <div className={styles.panelLabel}>Account</div>
        <p>
          <strong>Organization:</strong> {org}
        </p>
        <p>
          <strong>Email:</strong> {email}
        </p>
        <p>
          <strong>Role:</strong> {role}
        </p>
      </section>
    </div>
  );
}
