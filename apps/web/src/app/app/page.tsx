'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { workHomeVariant, type WorkHomeVariant } from '@ellines-eip/shared';
import { getSession } from '@/lib/api';
import styles from './command.module.css';

type Kpi = { label: string; value: string; hint: string; tone?: 'warn' | 'pos' | 'ready' };

const MOCK: Record<WorkHomeVariant, { title: string; lede: string; kpis: Kpi[]; focus: string }> = {
  executive: {
    title: 'Executive overview',
    lede: 'Enterprise-wide health, risks, and the Daily Brief — mock data until connectors are live.',
    kpis: [
      { label: 'Enterprise Health', value: '78', hint: 'Mock composite' },
      { label: 'Critical alerts', value: '3', hint: 'Needs attention', tone: 'warn' },
      { label: 'Open decisions', value: '5', hint: 'Awaiting you' },
      { label: 'Ellinea status', value: 'Ready', hint: 'Standing by', tone: 'ready' },
    ],
    focus: 'Morning brief and org-wide risk',
  },
  manager: {
    title: 'Branch & team view',
    lede: 'Scoped to your branch and department. Live sync arrives with Integration Hub.',
    kpis: [
      { label: 'Team health', value: '82', hint: 'Mock branch score' },
      { label: 'Local alerts', value: '2', hint: 'Ops queue', tone: 'warn' },
      { label: 'Approvals', value: '4', hint: 'Pending you' },
      { label: 'Ellinea status', value: 'Ready', hint: 'Ask in context', tone: 'ready' },
    ],
    focus: 'Local KPIs and approvals',
  },
  member: {
    title: 'What needs you',
    lede: 'Tasks, alerts, and Ellinea in your scope — not the full executive board.',
    kpis: [
      { label: 'My tasks', value: '6', hint: 'Open items' },
      { label: 'Alerts for me', value: '1', hint: 'Unread', tone: 'warn' },
      { label: 'Mentions', value: '0', hint: 'No brief yet' },
      { label: 'Ellinea status', value: 'Ready', hint: 'Ask anything', tone: 'ready' },
    ],
    focus: 'Personal work queue',
  },
  admin: {
    title: 'Org command + IT',
    lede: 'You have Work Console access plus IT Admin rights. Use Admin to invite and assign roles.',
    kpis: [
      { label: 'Enterprise Health', value: '78', hint: 'Mock composite' },
      { label: 'Active members', value: '—', hint: 'See IT Admin' },
      { label: 'Connectors', value: '0', hint: 'Connect to unlock', tone: 'warn' },
      { label: 'Ellinea status', value: 'Ready', hint: 'Standing by', tone: 'ready' },
    ],
    focus: 'Rights, connectors, and org health',
  },
};

export default function CommandCenterPage() {
  const [name, setName] = useState('there');
  const [variant, setVariant] = useState<WorkHomeVariant>('member');

  useEffect(() => {
    const s = getSession();
    const first = s?.user.fullName?.split(' ')[0];
    if (first) setName(first);
    setVariant(workHomeVariant(s?.user.role));
  }, []);

  const home = MOCK[variant];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Work Console · {home.title}</p>
          <h1>Welcome back, {name}</h1>
          <p className={styles.lede}>{home.lede}</p>
        </div>
        <p className={styles.slogan}>Where Enterprise Systems Think Together.</p>
      </header>

      <div className={styles.kpis}>
        {home.kpis.map((k) => (
          <article key={k.label} className={styles.kpi}>
            <span>{k.label}</span>
            <strong className={k.tone === 'ready' ? styles.ready : undefined}>{k.value}</strong>
            <em className={k.tone === 'warn' ? styles.warn : k.tone === 'pos' || k.tone === 'ready' ? styles.pos : undefined}>
              {k.hint}
            </em>
          </article>
        ))}
      </div>

      <div className={styles.board}>
        <section className={styles.health}>
          <div className={styles.panelLabel}>Focus</div>
          <div className={styles.scoreWrap}>
            <span className={styles.score}>{variant === 'member' ? '•' : '78'}</span>
            <span className={styles.scoreHint}>{home.focus}</span>
          </div>
          <p className={styles.panelCopy}>
            {variant === 'admin'
              ? 'Invite users and assign executive / manager / member roles from IT Admin. Connectors unlock live KPIs.'
              : variant === 'executive'
                ? 'Once connectors sync, this panel becomes your live Enterprise Health Score with drill-down.'
                : variant === 'manager'
                  ? 'Branch-scoped metrics appear here when Integration Hub feeds your org model.'
                  : 'Your queue stays personal — org-wide boards stay with executives and managers.'}
          </p>
          {variant === 'admin' ? (
            <Link href="/app/admin" className={styles.panelAction}>
              Open IT Admin →
            </Link>
          ) : (
            <Link href="/app/ellinea" className={styles.panelAction}>
              Ask Ellinea →
            </Link>
          )}
        </section>

        <section className={styles.brief}>
          <div className={styles.briefHead}>
            <div className={styles.panelLabel}>
              {variant === 'executive' || variant === 'admin' ? 'CEO Daily Brief' : 'Ellinea for you'}
            </div>
            <img src="/brand/ellinea-mark.png" alt="" className={styles.ellineaChip} />
          </div>
          <h2>Ellinea AI is ready</h2>
          <p>
            {variant === 'executive' || variant === 'admin'
              ? 'Ellinea prepares your morning brief with highlights, risks, and recommended actions — grounded in your systems.'
              : 'Ask Ellinea about alerts and work in your scope. Answers stay explainable and role-aware.'}
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
                <strong>Access layers online</strong>
                <p>Work Console, Org IT Admin, and Platform Super Admin are separated by role.</p>
              </div>
            </li>
            <li>
              <span className={styles.rail} aria-hidden />
              <div>
                <strong>Next: Integration Hub</strong>
                <p>Connect ERP, CRM, or ops data so mock KPIs become live intelligence.</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
