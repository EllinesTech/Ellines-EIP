'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { getSession } from '@/lib/api';
import styles from '../command.module.css';

export default function ConnectorsPlaceholderPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!isOrgAdminRole(s.user.role)) {
      router.replace('/app');
      return;
    }
    setOk(true);
  }, [router]);

  if (!ok) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking access…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Integration Hub · IT Admin</p>
          <h1>Connectors</h1>
          <p className={styles.lede}>Universal Connector Framework — coming in Phase 2.</p>
        </div>
      </header>
      <section className={styles.brief}>
        <div className={styles.panelLabel}>Integration Hub</div>
        <h2>Connect Systems of Record</h2>
        <p>
          REST API, PostgreSQL, CSV, and Email connectors will appear here so Ellines EIP can observe
          your systems without replacing them. Only org owners and admins configure connectors.
        </p>
      </section>
    </div>
  );
}
