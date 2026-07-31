'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  buildDailyBriefText,
  buildEllineaAnswer,
  buildEllineaRecommendations,
  readEllineaMemory,
  writeEllineaMemory,
  type EllineaMemoryNote,
  type EllineaRecommendation,
} from '@/lib/ellinea-engine';
import { fetchEnterpriseSummary, getSession, type EnterpriseSummaryDto } from '@/lib/api';
import { readUiPrefs, type UiPrefs } from '@/lib/ui-prefs';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import ellineaStyles from './ellinea.module.css';

const PROMPTS = [
  'How are all my businesses performing today?',
  'What do you recommend?',
  'Which branches need attention?',
  'Summarize today\'s brief',
  'What happened recently?',
];

export default function EllineaPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [prefs, setPrefs] = useState<UiPrefs | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [question, setQuestion] = useState(PROMPTS[0]);
  const [answer, setAnswer] = useState('');
  const [recs, setRecs] = useState<EllineaRecommendation[]>([]);
  const [memory, setMemory] = useState<EllineaMemoryNote[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  useEffect(() => {
    const session = getSession();
    const ui = readUiPrefs();
    setPrefs(ui);
    setOrgId(session?.organization.id ?? null);
    if (session?.organization.id && ui.ellineaUseMemory) {
      setMemory(readEllineaMemory(session.organization.id));
    }

    fetchEnterpriseSummary()
      .then((s) => {
        setSummary(s);
        if (s.status === 'synced') {
          setRecs(
            buildEllineaRecommendations(s, {
              role: session?.user.role,
              useRoleContext: ui.ellineaRoleContext,
            }),
          );
          if (ui.ellineaAutoBrief) {
            setAnswer(
              buildEllineaAnswer('brief today', s, {
                memory:
                  session?.organization.id && ui.ellineaUseMemory
                    ? readEllineaMemory(session.organization.id)
                    : [],
                useMemory: ui.ellineaUseMemory,
                useRoleContext: ui.ellineaRoleContext,
                role: session?.user.role,
                fullName: session?.user.fullName,
                organizationName: session?.organization.name,
              }),
            );
          }
        }
      })
      .catch(() => setSummary(null));
  }, []);

  function ask(q: string) {
    const ui = prefs || readUiPrefs();
    const session = getSession();
    setAnswer(
      buildEllineaAnswer(q, summary, {
        memory: ui.ellineaUseMemory ? memory : [],
        useMemory: ui.ellineaUseMemory,
        useRoleContext: ui.ellineaRoleContext,
        role: session?.user.role,
        fullName: session?.user.fullName,
        organizationName: session?.organization.name,
      }),
    );
  }

  function onAsk(e: FormEvent) {
    e.preventDefault();
    ask(question);
  }

  function onSaveNote(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !noteTitle.trim() || !noteBody.trim()) return;
    const next: EllineaMemoryNote[] = [
      {
        id: `mem_${Date.now()}`,
        title: noteTitle.trim(),
        body: noteBody.trim(),
        updatedAt: new Date().toISOString(),
      },
      ...memory,
    ].slice(0, 40);
    setMemory(next);
    writeEllineaMemory(orgId, next);
    setNoteTitle('');
    setNoteBody('');
  }

  function onDeleteNote(id: string) {
    if (!orgId) return;
    const next = memory.filter((n) => n.id !== id);
    setMemory(next);
    writeEllineaMemory(orgId, next);
  }

  const synced = summary?.status === 'synced';
  const counts = summary?.model?.counts;
  const showRecs = prefs?.ellineaShowRecommendations !== false;
  const showMemory = prefs?.ellineaUseMemory !== false;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Ellinea AI</p>
          <h1>Ask Ellinea</h1>
          <p className={styles.lede}>
            Daily brief, explainable recommendations, and memory grounded in your latest sync.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/settings" className={styles.ghostBtn}>
            Ellinea settings
          </Link>
          <Link href="/app/timeline" className={styles.ghostBtn}>
            Timeline
          </Link>
          <img
            src="/brand/ellinea-mark.png"
            alt="Ellinea AI"
            className={styles.ellineaChip}
            style={{ height: 32 }}
          />
        </div>
      </header>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Daily Brief</div>
        <h2>{synced ? 'Prepared from live snapshot' : 'Waiting for connectors'}</h2>
        <p>{synced ? buildDailyBriefText(summary, {
          role: getSession()?.user.role,
          organizationName: getSession()?.organization.name,
          useRoleContext: prefs?.ellineaRoleContext !== false,
        }) : 'Sync a connector to unlock a grounded morning brief.'}</p>
        {synced && counts ? (
          <p>
            <strong>
              UEM · {counts.branches} branches · {counts.people} people · {counts.tasks} tasks ·{' '}
              {counts.notifications} alerts
            </strong>
          </p>
        ) : null}
      </section>

      {showRecs && synced ? (
        <section className={ellineaStyles.recs}>
          <div className={styles.panelLabel}>Recommendations</div>
          <p className={ellineaStyles.recsHint}>
            Explainable insights with evidence and confidence — template engine (LLM later).
          </p>
          <ul className={ellineaStyles.recList}>
            {recs.map((r) => (
              <li key={r.id} className={ellineaStyles.recItem} data-priority={r.priority}>
                <div className={ellineaStyles.recTop}>
                  <strong>{r.title}</strong>
                  <span className={ellineaStyles.confidence}>{r.confidence}%</span>
                </div>
                <p>{r.rationale}</p>
                <ul className={ellineaStyles.evidence}>
                  {r.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Ask</div>
        <div className={styles.headerActions} style={{ marginTop: '0.45rem' }}>
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              className={styles.ghostBtn}
              onClick={() => {
                setQuestion(p);
                ask(p);
              }}
            >
              {p.length > 34 ? `${p.slice(0, 32)}…` : p}
            </button>
          ))}
        </div>
        <form className={adminStyles.form} onSubmit={onAsk} style={{ marginTop: '0.65rem' }}>
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
        {answer ? <p className={ellineaStyles.answer}>{answer}</p> : null}
      </section>

      {showMemory ? (
        <section className={ellineaStyles.memory}>
          <div className={styles.panelLabel}>Enterprise Memory</div>
          <p className={ellineaStyles.recsHint}>
            Local notes for this organization (this browser). Used when you ask about policy or memory.
          </p>
          <form className={adminStyles.form} onSubmit={onSaveNote}>
            <label>
              Title
              <input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Approval policy"
                required
                minLength={2}
              />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              Note
              <input
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Owner must approve spend over 500k"
                required
                minLength={4}
              />
            </label>
            <button type="submit" className={adminStyles.primary} disabled={!orgId}>
              Save note
            </button>
          </form>
          {memory.length ? (
            <ul className={ellineaStyles.memoryList}>
              {memory.map((n) => (
                <li key={n.id}>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                  </div>
                  <button
                    type="button"
                    className={adminStyles.ghost}
                    onClick={() => onDeleteNote(n.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.lede}>No memory notes yet.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
