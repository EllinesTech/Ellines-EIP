'use client';

import { getSession } from '@/lib/api';
import { useEffect, useState } from 'react';
import styles from './command.module.css';

export default function CommandCenterPage() {
  const [name, setName] = useState('');

  useEffect(() => {
    const s = getSession();
    setName(s?.user.fullName?.split(' ')[0] || 'there');
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Executive Command Center</h1>
        <p>Welcome back, {name}. Here is your enterprise intelligence overview.</p>
      </header>

      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.health}`}>
          <div className={styles.panelLabel}>Enterprise Health Score</div>
          <div className={styles.score}>—</div>
          <p className={styles.panelHint}>Connect systems to unlock your live health score.</p>
        </section>

        <section className={`${styles.panel} ${styles.brief}`}>
          <div className={styles.panelLabel}>CEO Daily Brief</div>
          <h2>Ellinea AI is ready</h2>
          <p>
            Once connectors are live, Ellinea will prepare your morning brief with financial
            highlights, risks, and recommended actions.
          </p>
        </section>

        <section className={`${styles.panel} ${styles.timeline}`}>
          <div className={styles.panelLabel}>Enterprise Timeline</div>
          <ul className={styles.events}>
            <li>
              <span className={styles.dot} />
              <div>
                <strong>Platform online</strong>
                <p>Identity and Command Center are ready for your organization.</p>
              </div>
            </li>
            <li>
              <span className={styles.dot} />
              <div>
                <strong>Next: Integration Hub</strong>
                <p>Connect your first System of Record to feed live intelligence.</p>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
