'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import {
  askEllineaApi,
  fetchEllineaMemory,
  fetchEnterpriseSummary,
  getSession,
  type EllineaMemoryNoteDto,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import { buildDailyBriefText, buildEllineaRecommendations } from '@/lib/ellinea-engine';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

export default function EllineaConsolePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [memory, setMemory] = useState<EllineaMemoryNoteDto[]>([]);
  const [question, setQuestion] = useState('How are we performing today?');
  const [answer, setAnswer] = useState('');
  const [brief, setBrief] = useState('');
  const [recs, setRecs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!isOrgAdminRole(s.user.role)) {
      router.replace('/app/ellinea');
      return;
    }
    setAllowed(true);
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
    fetchEllineaMemory()
      .then(setMemory)
      .catch(() => setMemory([]));
  }, [router]);

  function onBrief() {
    const session = getSession();
    setBrief(
      buildDailyBriefText(summary, {
        role: session?.user.role,
        organizationName: session?.organization.name,
        useRoleContext: true,
      }),
    );
  }

  function onRecommend() {
    const session = getSession();
    setRecs(
      buildEllineaRecommendations(summary, {
        role: session?.user.role,
        useRoleContext: true,
      }).map((r) => `${r.title} (${r.confidence}%) — ${r.rationale}`),
    );
  }

  function onAsk(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    askEllineaApi({
      question,
      summary,
      memory,
      templateAnswer: '',
    })
      .then((res) => {
        setAnswer(res.answer);
        setNotice(`Mode · ${res.mode}${res.provider ? ` · ${res.provider}` : ''}`);
      })
      .catch((err) => setNotice(err instanceof Error ? err.message : 'Ask failed'))
      .finally(() => setBusy(false));
  }

  if (!allowed) {
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
          <p className={styles.eyebrow}>Ellinea · operator / API lab</p>
          <h1>Ellinea console</h1>
          <p className={styles.lede}>
            Owner/IT smoke UI over the Ellinea contract (ask / brief / recommend / memory) — not
            everyday chat. Everyday Ask stays in the float / full workspace; prefs live under System
            Settings. Reuse outside EIP via <code>@ellines-eip/ellinea-sdk</code>.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
          <Link href="/app/connectors" className={styles.ghostBtn}>
            Connectors
          </Link>
        </div>
      </header>

      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Snapshot</div>
        <p>
          {summary?.status === 'synced'
            ? `Synced · ${summary.connectorName} · health ${summary.healthScore} · memory ${memory.length}`
            : `No live sync · memory ${memory.length} note(s)`}
        </p>
        <div className={styles.headerActions} style={{ marginTop: '0.45rem' }}>
          <button type="button" className={styles.ghostBtn} onClick={onBrief}>
            Run brief
          </button>
          <button type="button" className={styles.ghostBtn} onClick={onRecommend}>
            Run recommend
          </button>
        </div>
      </section>

      {brief ? (
        <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
          <div className={styles.panelLabel}>Brief</div>
          <p>{brief}</p>
        </section>
      ) : null}

      {recs.length ? (
        <section className={adminStyles.tableWrap} style={{ marginTop: '0.65rem' }}>
          <div className={styles.panelLabel}>Recommendations · {recs.length}</div>
          <ul className={adminStyles.structList}>
            {recs.map((r) => (
              <li key={r}>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Ask (API)</div>
        <form className={adminStyles.form} onSubmit={onAsk}>
          <label style={{ gridColumn: '1 / -1' }}>
            Question
            <input value={question} onChange={(e) => setQuestion(e.target.value)} required />
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            {busy ? 'Asking…' : 'POST /ellinea/ask'}
          </button>
        </form>
        {answer ? <p style={{ marginTop: '0.65rem', whiteSpace: 'pre-wrap' }}>{answer}</p> : null}
      </section>

      <section className={adminStyles.tableWrap} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Memory · {memory.length}</div>
        {!memory.length ? (
          <p className={styles.lede}>No server Memory notes — add some on Ask Ellinea.</p>
        ) : (
          <ul className={adminStyles.structList}>
            {memory.slice(0, 10).map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>
                <span>{n.body}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
