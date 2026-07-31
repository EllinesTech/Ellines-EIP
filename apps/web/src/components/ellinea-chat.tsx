'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  fetchEnterpriseSummary,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import styles from './ellinea-chat.module.css';

export function buildEllineaAnswer(
  question: string,
  summary: EnterpriseSummaryDto | null,
): string {
  const q = question.toLowerCase();
  if (!summary || summary.status !== 'synced') {
    return 'I do not have a live enterprise snapshot yet. Ask IT to open Connectors and sync Demo JSON Systems, then ask again.';
  }
  if (q.includes('health') || q.includes('performing') || q.includes('how are')) {
    return `Enterprise health is ${summary.healthScore}/100 across ${summary.connectedSystems} connected systems. ${summary.briefHighlight}`;
  }
  if (q.includes('alert') || q.includes('risk')) {
    return `There are ${summary.openAlerts} open alerts in the latest sync. ${summary.briefHighlight}`;
  }
  if (q.includes('decision') || q.includes('approval')) {
    return `There are ${summary.openDecisions} open decisions waiting. Prioritize them before the next brief cycle.`;
  }
  if (q.includes('brief') || q.includes('today') || q.includes('morning')) {
    return `Daily brief: ${summary.briefHighlight} (synced ${summary.syncedAt ? new Date(summary.syncedAt).toLocaleString() : 'recently'} via ${summary.connectorName}).`;
  }
  return `From ${summary.connectorName}: health ${summary.healthScore}, ${summary.openAlerts} alerts, ${summary.openDecisions} open decisions. ${summary.briefHighlight}`;
}

type Msg = { role: 'user' | 'assistant'; text: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function EllineaChatPanel({ open, onClose }: Props) {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text: 'Hi — I am Ellinea. Ask about health, alerts, decisions, or your daily brief.',
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    window.setTimeout(() => {
      const answer = buildEllineaAnswer(q, summary);
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
      setBusy(false);
    }, 280);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  if (!open) return null;

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Ask Ellinea AI">
      <button type="button" className={styles.backdrop} onClick={onClose} aria-label="Close chat" />
      <div className={styles.panel}>
        <header className={styles.head}>
          <div className={styles.headBrand}>
            <img src="/brand/ellinea-mark.png" alt="" className={styles.mark} />
            <div>
              <strong>Ellinea AI</strong>
              <span>Ask without leaving this page</span>
            </div>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={styles.thread}>
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={m.role === 'user' ? `${styles.bubble} ${styles.user}` : `${styles.bubble} ${styles.bot}`}
            >
              {m.text}
            </div>
          ))}
          {busy ? <div className={`${styles.bubble} ${styles.bot} ${styles.typing}`}>Thinking…</div> : null}
          <div ref={endRef} />
        </div>

        <div className={styles.suggestions}>
          {['How are we performing?', 'Any risks?', 'Daily brief'].map((s) => (
            <button key={s} type="button" className={styles.chip} onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>

        <form className={styles.composer} onSubmit={onSubmit}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Ellinea anything…"
            aria-label="Message Ellinea"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M5 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
