'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  buildDailyBriefText,
  buildEllineaAnswer,
  buildLearningSignals,
  buildRankedRecommendations,
  readEllineaMemory,
  readRecFeedback,
  rebuildEnterpriseDna,
  recordRecFeedback,
  writeEllineaMemory,
  writeEnterpriseDna,
  writeRecFeedback,
  type EllineaMemoryNote,
  type EllineaRecommendation,
  type EnterpriseDnaSnapshot,
  type LearningSignal,
} from '@/lib/ellinea-engine';
import { readApprovals } from '@/lib/approvals';
import {
  askEllineaApi,
  fetchEllineaLearning,
  fetchEllineaMemory,
  fetchEnterpriseSummary,
  getSession,
  saveEllineaLearning,
  saveEllineaMemory,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import { publishEnterpriseEvent } from '@/lib/event-bus';
import { formatRagGrounding, retrieveEllineaContext } from '@/lib/ellinea-rag';
import { readUiPrefs, type UiPrefs } from '@/lib/ui-prefs';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import ellineaStyles from './ellinea.module.css';

const PROMPTS = [
  'How are all my businesses performing today?',
  'What do you recommend?',
  'How do we work? (Enterprise DNA)',
  'Summarize today\'s brief',
  'What happened recently?',
];

function refreshDna(
  organizationId: string,
  organizationName: string | undefined,
  role: string | undefined,
  memoryNotes: EllineaMemoryNote[],
): EnterpriseDnaSnapshot {
  return rebuildEnterpriseDna({
    organizationId,
    organizationName,
    role,
    memory: memoryNotes,
    approvals: readApprovals(organizationId),
    feedback: readRecFeedback(organizationId),
  });
}

export default function EllineaPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [prefs, setPrefs] = useState<UiPrefs | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [question, setQuestion] = useState(PROMPTS[0]);
  const [answer, setAnswer] = useState('');
  const [recs, setRecs] = useState<EllineaRecommendation[]>([]);
  const [memory, setMemory] = useState<EllineaMemoryNote[]>([]);
  const [dna, setDna] = useState<EnterpriseDnaSnapshot | null>(null);
  const [signals, setSignals] = useState<LearningSignal[]>([]);
  const [answerMode, setAnswerMode] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // Memory note form — keep these useState hooks (ReferenceError if omitted in production).
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  function refreshSignals(
    organizationId: string,
    s: EnterpriseSummaryDto | null,
    mem: EllineaMemoryNote[],
  ) {
    setSignals(
      buildLearningSignals({
        summary: s,
        approvals: readApprovals(organizationId),
        feedback: readRecFeedback(organizationId),
        memoryCount: mem.length,
      }),
    );
  }

  useEffect(() => {
    const session = getSession();
    const ui = readUiPrefs();
    setPrefs(ui);
    setOrgId(session?.organization.id ?? null);
    const localMem =
      session?.organization.id && ui.ellineaUseMemory
        ? readEllineaMemory(session.organization.id)
        : [];
    setMemory(localMem);
    if (session?.organization.id && ui.ellineaUseDna) {
      setDna(
        refreshDna(
          session.organization.id,
          session.organization.name,
          session.user.role,
          localMem,
        ),
      );
    }
    if (session?.organization.id) {
      refreshSignals(session.organization.id, null, localMem);
    }

    const orgIdForSync = session?.organization.id;
    if (orgIdForSync && ui.ellineaUseMemory) {
      fetchEllineaMemory()
        .then((serverMem) => {
          let merged = serverMem;
          if (!serverMem.length && localMem.length) {
            merged = localMem;
            void saveEllineaMemory(localMem).catch(() => undefined);
          } else if (serverMem.length) {
            writeEllineaMemory(orgIdForSync, serverMem);
          }
          setMemory(merged);
          if (ui.ellineaUseDna) {
            setDna(
              refreshDna(
                orgIdForSync,
                session?.organization.name,
                session?.user.role,
                merged,
              ),
            );
          }
          refreshSignals(orgIdForSync, null, merged);
        })
        .catch(() => undefined);
    }

    if (orgIdForSync) {
      fetchEllineaLearning()
        .then((learning) => {
          if (learning.feedback && Object.keys(learning.feedback).length) {
            writeRecFeedback(orgIdForSync, learning.feedback);
          }
          if (learning.dna) {
            writeEnterpriseDna({
              organizationId: orgIdForSync,
              updatedAt: learning.dna.updatedAt,
              summary: learning.dna.summary,
              traits: learning.dna.traits.map((t) => ({
                id: t.id,
                label: t.label,
                detail: t.detail,
                source: (t.source as EnterpriseDnaSnapshot['traits'][number]['source']) || 'memory',
              })),
            });
            if (ui.ellineaUseDna) {
              setDna({
                organizationId: orgIdForSync,
                updatedAt: learning.dna.updatedAt,
                summary: learning.dna.summary,
                traits: learning.dna.traits.map((t) => ({
                  id: t.id,
                  label: t.label,
                  detail: t.detail,
                  source:
                    (t.source as EnterpriseDnaSnapshot['traits'][number]['source']) || 'memory',
                })),
              });
            }
          }
        })
        .catch(() => undefined);
    }

    fetchEnterpriseSummary()
      .then((s) => {
        setSummary(s);
        if (session?.organization.id) {
          refreshSignals(session.organization.id, s, localMem);
        }
        if (s.status === 'synced') {
          setRecs(
            buildRankedRecommendations(s, {
              role: session?.user.role,
              useRoleContext: ui.ellineaRoleContext,
              organizationId: session?.organization.id,
              useFeedback: ui.ellineaRecFeedback,
              useDna: ui.ellineaUseDna,
              dna:
                session?.organization.id && ui.ellineaUseDna
                  ? refreshDna(
                      session.organization.id,
                      session.organization.name,
                      session.user.role,
                      localMem,
                    )
                  : null,
              memory: localMem,
            }),
          );
          if (ui.ellineaAutoBrief) {
            const briefDna =
              session?.organization.id && ui.ellineaUseDna
                ? refreshDna(
                    session.organization.id,
                    session.organization.name,
                    session.user.role,
                    localMem,
                  )
                : null;
            setAnswer(
              buildEllineaAnswer('brief today', s, {
                memory: localMem,
                useMemory: ui.ellineaUseMemory,
                useRoleContext: ui.ellineaRoleContext,
                useDna: ui.ellineaUseDna,
                dna: briefDna,
                learningSignals: buildLearningSignals({
                  summary: s,
                  approvals: session?.organization.id
                    ? readApprovals(session.organization.id)
                    : [],
                  feedback: session?.organization.id
                    ? readRecFeedback(session.organization.id)
                    : {},
                  memoryCount: localMem.length,
                }),
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

  function persistLearning(organizationId: string, dnaSnap: EnterpriseDnaSnapshot | null) {
    writeRecFeedback(organizationId, readRecFeedback(organizationId));
    if (dnaSnap) writeEnterpriseDna(dnaSnap);
    void saveEllineaLearning({
      feedback: readRecFeedback(organizationId),
      dna: dnaSnap
        ? {
            organizationId: dnaSnap.organizationId,
            updatedAt: dnaSnap.updatedAt,
            summary: dnaSnap.summary,
            traits: dnaSnap.traits.map((t) => ({
              id: t.id,
              label: t.label,
              detail: t.detail,
              source: t.source,
            })),
          }
        : null,
    }).catch(() => undefined);
  }

  function persistMemory(next: EllineaMemoryNote[]) {
    if (!orgId) return;
    setMemory(next);
    writeEllineaMemory(orgId, next);
    void saveEllineaMemory(next)
      .then(() => {
        publishEnterpriseEvent('ellinea.memory.updated', { count: next.length });
      })
      .catch(() => undefined);
    const session = getSession();
    if (prefs?.ellineaUseDna !== false) {
      const nextDna = refreshDna(orgId, session?.organization.name, session?.user.role, next);
      setDna(nextDna);
      persistLearning(orgId, nextDna);
    }
    refreshSignals(orgId, summary, next);
  }

  function ask(q: string) {
    const ui = prefs || readUiPrefs();
    const session = getSession();
    const template = buildEllineaAnswer(q, summary, {
      memory: ui.ellineaUseMemory ? memory : [],
      useMemory: ui.ellineaUseMemory,
      useRoleContext: ui.ellineaRoleContext,
      useDna: ui.ellineaUseDna,
      dna: ui.ellineaUseDna ? dna : null,
      learningSignals: signals,
      role: session?.user.role,
      fullName: session?.user.fullName,
      organizationName: session?.organization.name,
    });
    const chunks = retrieveEllineaContext({
      question: q,
      summary,
      memory: ui.ellineaUseMemory ? memory : [],
      dna: ui.ellineaUseDna ? dna : null,
    });
    // Always attach ranked citations when synced RAG returns chunks.
    const grounded =
      chunks.length > 0
        ? `${template}\n\nSources:\n${formatRagGrounding(chunks.slice(0, 6))}`
        : template;

    if (ui.ellineaUseLlm === false) {
      setAnswer(grounded);
      setAnswerMode('template+rag');
      return;
    }

    setAsking(true);
    setAnswerMode('…');
    askEllineaApi({
      question: q,
      summary,
      memory,
      templateAnswer: grounded,
      dna: ui.ellineaUseDna ? dna : null,
      role: session?.user.role,
      organizationName: session?.organization.name,
    })
      .then((res) => {
        setAnswer(res.answer);
        setAnswerMode(
          res.mode === 'llm'
            ? `llm · ${res.provider || 'provider'}`
            : res.mode === 'error'
              ? 'template+rag (llm error)'
              : 'template+rag',
        );
        publishEnterpriseEvent('ellinea.ask', { mode: res.mode, qLen: q.length });
      })
      .catch(() => {
        setAnswer(grounded);
        setAnswerMode('template+rag');
      })
      .finally(() => setAsking(false));
  }

  function onFeedback(recId: string, vote: 'helpful' | 'dismiss') {
    if (!orgId || prefs?.ellineaRecFeedback === false) return;
    recordRecFeedback(orgId, recId, vote);
    const session = getSession();
    let nextDna: EnterpriseDnaSnapshot | null = null;
    if (prefs?.ellineaUseDna !== false) {
      nextDna = refreshDna(orgId, session?.organization.name, session?.user.role, memory);
      setDna(nextDna);
    }
    persistLearning(orgId, nextDna);
    setRecs(
      buildRankedRecommendations(summary, {
        role: session?.user.role,
        useRoleContext: prefs?.ellineaRoleContext !== false,
        organizationId: orgId,
        useFeedback: true,
        useDna: prefs?.ellineaUseDna !== false,
        dna: nextDna ?? dna,
        memory,
        learningSignals: signals,
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
    persistMemory(next);
    setNoteTitle('');
    setNoteBody('');
  }

  function onDeleteNote(id: string) {
    if (!orgId) return;
    persistMemory(memory.filter((n) => n.id !== id));
  }

  const synced = summary?.status === 'synced';
  const counts = summary?.model?.counts;
  const showRecs = prefs?.ellineaShowRecommendations !== false;
  const showMemory = prefs?.ellineaUseMemory !== false;
  const showDna = prefs?.ellineaUseDna !== false;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Ellinea AI</p>
          <h1>Ask Ellinea</h1>
          <p className={styles.lede}>
            Daily brief, RAG-grounded answers, and memory from your latest sync (LLM when configured).
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
          useMemory: prefs?.ellineaUseMemory !== false,
          memory: prefs?.ellineaUseMemory !== false ? memory : [],
          useDna: prefs?.ellineaUseDna !== false,
          dna: prefs?.ellineaUseDna !== false ? dna : null,
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
            Explainable insights with evidence and confidence. Mark helpful or dismiss so Ellinea
            learns what matters for this organization.
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
                {prefs?.ellineaRecFeedback !== false && orgId ? (
                  <div className={ellineaStyles.feedbackRow}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => onFeedback(r.id, 'helpful')}
                    >
                      Helpful
                    </button>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      onClick={() => onFeedback(r.id, 'dismiss')}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
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
          <button type="submit" className={adminStyles.primary} disabled={asking}>
            {asking ? 'Asking…' : 'Ask Ellinea'}
          </button>
        </form>
        {answerMode ? (
          <p className={ellineaStyles.recsHint} style={{ marginTop: '0.45rem' }}>
            Mode · {answerMode}
          </p>
        ) : null}
        {answer ? <p className={ellineaStyles.answer}>{answer}</p> : null}
      </section>

      {showDna && dna ? (
        <section className={ellineaStyles.recs} style={{ marginTop: '0.65rem' }}>
          <div className={styles.panelLabel}>Enterprise DNA</div>
          <p className={ellineaStyles.recsHint}>{dna.summary}</p>
          <ul className={ellineaStyles.recList}>
            {dna.traits.slice(0, 8).map((t) => (
              <li key={t.id} className={ellineaStyles.recItem}>
                <div className={ellineaStyles.recTop}>
                  <strong>{t.label}</strong>
                  <span className={ellineaStyles.confidence}>{t.source}</span>
                </div>
                <p>{t.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {signals.length ? (
        <section className={ellineaStyles.recs} style={{ marginTop: '0.65rem' }}>
          <div className={styles.panelLabel}>Learning signals</div>
          <p className={ellineaStyles.recsHint}>
            Outcome patterns from approvals, alerts, feedback, and memory depth.
          </p>
          <ul className={ellineaStyles.recList}>
            {signals.map((s) => (
              <li key={s.id} className={ellineaStyles.recItem}>
                <div className={ellineaStyles.recTop}>
                  <strong>{s.label}</strong>
                  <span className={ellineaStyles.confidence}>{s.kind}</span>
                </div>
                <p>{s.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showMemory ? (
        <section className={ellineaStyles.memory}>
          <div className={styles.panelLabel}>Enterprise Memory</div>
          <p className={ellineaStyles.recsHint}>
            Org-scoped notes synced to the server (cached locally). Used when you ask about policy or memory.
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
