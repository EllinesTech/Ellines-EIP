'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { buildEllineaAnswer } from '@/components/ellinea-chat';
import { fetchEnterpriseSummary, type EnterpriseSummaryDto } from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

const PROMPTS = [
  'How are all my businesses performing today?',
  'Which branches need attention?',
  'Summarize yesterday\'s critical alerts.',
  'What happened recently?',
  'How many people are in the model?',
];

export default function EllineaPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [question, setQuestion] = useState(PROMPTS[0]);
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    fetchEnterpriseSummary()
      .then((s) => {
        setSummary(s);
        if (s.status === 'synced') {
          setAnswer(buildEllineaAnswer('brief today', s));
        }
      })
      .catch(() => setSummary(null));
  }, []);

  function onAsk(e: FormEvent) {
    e.preventDefault();
    setAnswer(buildEllineaAnswer(question, summary));
  }

  const synced = summary?.status === 'synced';
  const counts = summary?.model?.counts;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Ellinea AI</p>
          <h1>Ask Ellinea</h1>
          <p className={styles.lede}>
            Grounded answers from your latest connector sync and Universal Enterprise Model. Full LLM
            reasoning lands next.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/timeline" className={styles.ghostBtn}>
            Timeline
          </Link>
          <Link href="/app/notifications" className={styles.ghostBtn}>
            Notifications
          </Link>
          <img
            src="/brand/ellinea-mark.png"
            alt="Ellinea AI"
            className={styles.ellineaChip}
            style={{ height: 40 }}
          />
        </div>
      </header>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Daily Brief</div>
        <h2>{synced ? 'Prepared from live snapshot' : 'Waiting for connectors'}</h2>
        <p>
          {synced
            ? summary!.briefHighlight
            : 'Sync a connector under Connectors to unlock a grounded morning brief.'}
        </p>
        {synced && counts ? (
          <p>
            <strong>
              UEM · {counts.branches} branches · {counts.people} people · {counts.tasks} tasks ·{' '}
              {counts.notifications} alerts
            </strong>
          </p>
        ) : null}
      </section>

      <section className={styles.brief} style={{ marginTop: '0.75rem' }}>
        <div className={styles.panelLabel}>Ask</div>
        <div className={styles.headerActions} style={{ marginTop: '0.55rem' }}>
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              className={styles.ghostBtn}
              onClick={() => {
                setQuestion(p);
                setAnswer(buildEllineaAnswer(p, summary));
              }}
            >
              {p.length > 36 ? `${p.slice(0, 34)}…` : p}
            </button>
          ))}
        </div>
        <form className={adminStyles.form} onSubmit={onAsk} style={{ marginTop: '0.75rem' }}>
          <label style={{ gridColumn: '1 / -1' }}>
            Question
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label="Question for Ellinea"
            />
          </label>
          <button type="submit" className={adminStyles.primary}>
            Ask Ellinea
          </button>
        </form>
        {answer ? (
          <p style={{ marginTop: '0.85rem', lineHeight: 1.5, color: '#c4b5fd', fontSize: '0.875rem' }}>
            {answer}
          </p>
        ) : null}
      </section>
    </div>
  );
}
