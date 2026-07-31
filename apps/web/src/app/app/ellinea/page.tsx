'use client';

import { FormEvent, useEffect, useState } from 'react';
import { buildEllineaAnswer } from '@/components/ellinea-chat';
import { fetchEnterpriseSummary, type EnterpriseSummaryDto } from '@/lib/api';
import styles from '../command.module.css';

export default function EllineaPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [question, setQuestion] = useState('How are all my businesses performing today?');
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Ellinea AI</p>
          <h1>Ask Ellinea</h1>
          <p className={styles.lede}>
            Grounded answers from your latest connector sync — full NL engine lands in Phase 4.
          </p>
        </div>
        <img
          src="/brand/ellinea-mark.png"
          alt="Ellinea AI"
          className={styles.ellineaChip}
          style={{ height: 48 }}
        />
      </header>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Daily Brief</div>
        <h2>
          {summary?.status === 'synced' ? 'Prepared from live snapshot' : 'Waiting for connectors'}
        </h2>
        <p>
          {summary?.status === 'synced'
            ? summary.briefHighlight
            : 'Sync Demo JSON Systems under Connectors to unlock a grounded morning brief.'}
        </p>
      </section>

      <section className={styles.brief} style={{ marginTop: '1rem' }}>
        <div className={styles.panelLabel}>Ask</div>
        <form onSubmit={onAsk} style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={{
              font: 'inherit',
              padding: '0.7rem 0.85rem',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: '#0b0e14',
              color: '#f4f7fb',
            }}
            aria-label="Question for Ellinea"
          />
          <button
            type="submit"
            style={{
              justifySelf: 'start',
              font: 'inherit',
              fontWeight: 700,
              padding: '0.6rem 1.1rem',
              borderRadius: 10,
              border: 'none',
              color: '#fff',
              background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
              cursor: 'pointer',
            }}
          >
            Ask Ellinea
          </button>
        </form>
        {answer ? (
          <p style={{ marginTop: '1rem', lineHeight: 1.55, color: '#c4b5fd' }}>{answer}</p>
        ) : null}
      </section>
    </div>
  );
}
