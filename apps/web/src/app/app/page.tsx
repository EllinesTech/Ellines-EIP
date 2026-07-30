'use client';

import Link from 'next/link';
import { getSession } from '@/lib/api';
import { useEffect, useState } from 'react';
import styles from './command.module.css';

export default function CommandCenterPage() {
  const [name, setName] = useState('there');

  useEffect(() => {
    const s = getSession();
    const first = s?.user.fullName?.split(' ')[0];
    if (first) setName(first);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Command Center</p>
          <h1>Welcome back, {name}</h1>
          <p className={styles.lede}>Here&apos;s what&apos;s happening across your enterprise.</p>
        </div>
        <p className={styles.slogan}>Where Enterprise Systems Think Together.</p>
      </header>

      <div className={styles.kpis}>
        <article className={styles.kpi}>
          <span>Enterprise Health</span>
          <strong>—</strong>
          <em>Awaiting connectors</em>
        </article>
        <article className={styles.kpi}>
          <span>Connected systems</span>
          <strong>0</strong>
          <em className={styles.warn}>Connect to unlock</em>
        </article>
        <article className={styles.kpi}>
          <span>Open decisions</span>
          <strong>—</strong>
          <em>No brief yet</em>
        </article>
        <article className={styles.kpi}>
          <span>Ellinea status</span>
          <strong className={styles.ready}>Ready</strong>
          <em className={styles.pos}>Standing by</em>
        </article>
      </div>

      <div className={styles.board}>
        <section className={styles.health}>
          <div className={styles.panelLabel}>Enterprise Health</div>
          <div className={styles.scoreWrap}>
            <span className={styles.score}>—</span>
            <span className={styles.scoreHint}>Awaiting data</span>
          </div>
          <p className={styles.panelCopy}>
            Connect your first System of Record to unlock a live health score across finance, ops,
            and risk.
          </p>
          <Link href="/app/connectors" className={styles.panelAction}>
            Open Connectors →
          </Link>
        </section>

        <section className={styles.brief}>
          <div className={styles.briefHead}>
            <div className={styles.panelLabel}>CEO Daily Brief</div>
            <img src="/brand/ellinea-mark.png" alt="" className={styles.ellineaChip} />
          </div>
          <h2>Ellinea AI is ready</h2>
          <p>
            Once connectors are live, Ellinea prepares your morning brief with highlights, risks,
            and recommended actions — grounded in your own systems.
          </p>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask Ellinea →
          </Link>
        </section>

        <section className={styles.timeline}>
          <div className={styles.panelLabel}>Enterprise Timeline</div>
          <ol className={styles.events}>
            <li>
              <span className={styles.rail} aria-hidden />
              <div>
                <strong>Platform online</strong>
                <p>Identity and Command Center are ready for your organization.</p>
              </div>
            </li>
            <li>
              <span className={styles.rail} aria-hidden />
              <div>
                <strong>Next: Integration Hub</strong>
                <p>Connect ERP, CRM, or ops data so Ellinea can think with your stack.</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
