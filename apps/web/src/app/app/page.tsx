'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { workHomeVariant, type WorkHomeVariant } from '@ellines-eip/shared';
import { fetchEnterpriseSummary, getSession, type EnterpriseSummaryDto } from '@/lib/api';
import styles from './command.module.css';

type Kpi = { label: string; value: string; hint: string; tone?: 'warn' | 'pos' | 'ready' };

function kpisFor(
  variant: WorkHomeVariant,
  summary: EnterpriseSummaryDto | null,
): { title: string; lede: string; kpis: Kpi[]; focus: string } {
  const synced = summary?.status === 'synced';
  const health = synced ? String(summary!.healthScore) : '—';
  const systems = synced ? String(summary!.connectedSystems) : '0';
  const alerts = synced ? String(summary!.openAlerts) : '—';
  const decisions = synced ? String(summary!.openDecisions) : '—';

  const base = {
    executive: {
      title: 'Executive overview',
      lede: synced
        ? 'Live enterprise snapshot from your connectors.'
        : 'Sync Demo JSON Systems in Connectors to unlock live KPIs.',
      focus: 'Morning brief and org-wide risk',
      kpis: [
        { label: 'Enterprise Health', value: health, hint: synced ? 'From connectors' : 'Awaiting sync' },
        {
          label: 'Critical alerts',
          value: alerts,
          hint: synced ? 'Needs attention' : 'No feed',
          tone: 'warn' as const,
        },
        { label: 'Open decisions', value: decisions, hint: synced ? 'Awaiting you' : 'No brief yet' },
        { label: 'Ellinea status', value: 'Ready', hint: 'Standing by', tone: 'ready' as const },
      ],
    },
    manager: {
      title: 'Branch & team view',
      lede: synced
        ? 'Scoped view using the latest enterprise sync.'
        : 'Sync a connector to populate branch metrics.',
      focus: 'Local KPIs and approvals',
      kpis: [
        { label: 'Team health', value: health, hint: synced ? 'From snapshot' : 'Awaiting sync' },
        {
          label: 'Local alerts',
          value: alerts,
          hint: 'Ops queue',
          tone: 'warn' as const,
        },
        { label: 'Approvals', value: decisions, hint: 'Pending you' },
        { label: 'Ellinea status', value: 'Ready', hint: 'Ask in context', tone: 'ready' as const },
      ],
    },
    member: {
      title: 'What needs you',
      lede: synced
        ? 'Tasks and alerts derived from the latest sync.'
        : 'Once IT syncs connectors, your queue lights up here.',
      focus: 'Personal work queue',
      kpis: [
        { label: 'My tasks', value: decisions, hint: 'Open items' },
        { label: 'Alerts for me', value: alerts, hint: 'Unread', tone: 'warn' as const },
        { label: 'Connected systems', value: systems, hint: synced ? 'In model' : 'None yet' },
        { label: 'Ellinea status', value: 'Ready', hint: 'Ask anything', tone: 'ready' as const },
      ],
    },
    admin: {
      title: 'Org command + IT',
      lede: synced
        ? 'Work Console plus IT Admin — connectors are feeding KPIs.'
        : 'Use Connectors → Sync now, then return for live health.',
      focus: 'Rights, connectors, and org health',
      kpis: [
        { label: 'Enterprise Health', value: health, hint: synced ? 'Live composite' : 'Awaiting sync' },
        { label: 'Connected systems', value: systems, hint: synced ? 'Synced' : 'Connect to unlock', tone: 'warn' },
        { label: 'Open decisions', value: decisions, hint: synced ? 'In queue' : '—' },
        { label: 'Ellinea status', value: 'Ready', hint: 'Standing by', tone: 'ready' as const },
      ],
    },
  } as const;

  return base[variant];
}

export default function CommandCenterPage() {
  const [name, setName] = useState('there');
  const [variant, setVariant] = useState<WorkHomeVariant>('member');
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);

  useEffect(() => {
    const s = getSession();
    const first = s?.user.fullName?.split(' ')[0];
    if (first) setName(first);
    setVariant(workHomeVariant(s?.user.role));
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const home = kpisFor(variant, summary);
  const synced = summary?.status === 'synced';
  const timeline =
    synced && summary?.timeline?.length
      ? summary.timeline
      : [
          {
            title: 'Access layers online',
            detail: 'Work Console, Org IT Admin, and Platform Super Admin are separated by role.',
          },
          {
            title: 'Next: sync a connector',
            detail: 'Open Connectors and run Sync now on Demo JSON Systems.',
          },
        ];

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
            <strong>{k.value}</strong>
            <em
              className={
                k.tone === 'warn'
                  ? styles.warn
                  : k.tone === 'pos' || k.tone === 'ready'
                    ? styles.pos
                    : undefined
              }
            >
              {k.hint}
            </em>
          </article>
        ))}
      </div>

      <div className={styles.board}>
        <section className={styles.health}>
          <div className={styles.panelLabel}>Focus</div>
          <div className={styles.scoreWrap}>
            <span className={styles.score}>{synced ? String(summary!.healthScore) : '—'}</span>
            <span className={styles.scoreHint}>{home.focus}</span>
          </div>
          <p className={styles.panelCopy}>
            {synced
              ? summary!.briefHighlight
              : variant === 'admin'
                ? 'Invite users from IT Admin, then sync Demo JSON Systems to unlock live KPIs.'
                : 'Ask your IT admin to sync the first connector so this score becomes live.'}
          </p>
          {variant === 'admin' ? (
            <Link href="/app/connectors" className={styles.panelAction}>
              Open Connectors →
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
          <h2>{synced ? 'Brief from your systems' : 'Ellinea AI is ready'}</h2>
          <p>
            {synced
              ? summary!.briefHighlight
              : 'Once connectors sync, Ellinea prepares highlights, risks, and recommended actions.'}
          </p>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask Ellinea →
          </Link>
        </section>

        <section className={styles.timeline}>
          <div className={styles.panelLabel}>Enterprise Timeline</div>
          <ol className={styles.events}>
            {timeline.map((item) => (
              <li key={item.title}>
                <span className={styles.rail} aria-hidden />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
