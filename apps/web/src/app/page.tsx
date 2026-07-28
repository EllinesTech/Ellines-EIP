'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';
import styles from './home.module.css';

const PROMPTS = [
  'What is blocking revenue this week?',
  'Which branch is underperforming on stock turns?',
  'Summarize executive risk across connected systems.',
];

const CAPABILITIES = [
  {
    title: 'Ask the enterprise',
    body: 'Ellinea AI answers in plain language across ERP, CRM, and ops data — with sources you can trust.',
  },
  {
    title: 'Unify without replacing',
    body: 'Connectors sit above your stack. Keep the systems you already run. EIP makes them think together.',
  },
  {
    title: 'Decide with command',
    body: 'Executive KPIs, health scores, and workflows in one Command Center — built for directors and CEOs.',
  },
];

const CONNECTORS = ['ERP', 'CRM', 'PostgreSQL', 'REST APIs', 'CSV / Excel', 'Email', 'Hospital HIS', 'POS'];

export default function HomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [kpiPulse, setKpiPulse] = useState(0);

  useEffect(() => {
    if (getSession()) {
      router.replace('/app');
    }
  }, [router]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPromptIndex((i) => {
        const next = (i + 1) % PROMPTS.length;
        setPrompt(PROMPTS[next]);
        return next;
      });
      setKpiPulse((n) => n + 1);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  function onAsk(e: FormEvent) {
    e.preventDefault();
    router.push('/login');
  }

  const revenue = 12.4 + (kpiPulse % 3) * 0.1;
  const health = 86 + (kpiPulse % 4);

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden>
        <div className={styles.wash} />
        <div className={styles.grid} />
        <div className={styles.glowA} />
        <div className={styles.glowB} />
        <div className={styles.glowWarm} />
      </div>

      <header className={styles.topbar}>
        <Link href="/" className={styles.brandLockup} aria-label="Ellines EIP home">
          <span className={styles.brandMarkWrap}>
            <img src="/brand/logo-mark.png" alt="" className={styles.brandMark} />
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandEllines}>Ellines</span>
            <span className={styles.brandEip}>EIP</span>
          </span>
        </Link>
        <nav className={styles.topNav}>
          <a href="#capabilities" className={styles.navQuiet}>
            Platform
          </a>
          <a href="#ellinea" className={styles.navQuiet}>
            Ellinea AI
          </a>
          <Link href="/login" className={styles.navQuiet}>
            Sign in
          </Link>
          <Link href="/register" className={`${styles.navCta} btn btn-primary`}>
            Get started
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.greeting}>
            <span className={styles.greetingMark} aria-hidden>
              <img src="/brand/logo-mark.png" alt="" />
            </span>
            Welcome
          </p>
          <h1 className={styles.wordmark}>
            <span className={styles.wordEllines}>Ellines</span>{' '}
            <span className={styles.wordEip}>EIP</span>
          </h1>
          <p className={styles.tagline}>Where Enterprise Systems Think Together.</p>
          <p className={styles.support}>
            You’ve arrived at your enterprise intelligence home — the calm layer above ERP, CRM, and
            operations, powered by <strong>Ellinea AI</strong>. Settle in. Ask when you’re ready.
          </p>

          <div className={styles.actions}>
            <Link href="/login" className={`btn btn-primary ${styles.actionPrimary}`}>
              Welcome in
            </Link>
            <Link href="/register" className={`btn btn-secondary ${styles.actionSecondary}`}>
              Create your organization
            </Link>
          </div>

          <form className={styles.askBar} onSubmit={onAsk}>
            <label className={styles.askLabel} htmlFor="ellinea-ask">
              Or ask Ellinea when you’re ready
            </label>
            <div className={styles.askRow}>
              <input
                id="ellinea-ask"
                className={styles.askInput}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask anything about your enterprise…"
              />
              <button type="submit" className={`btn btn-primary ${styles.askSubmit}`}>
                Ask
              </button>
            </div>
            <p className={styles.askHint}>Sign in once — then run live queries on your connected systems.</p>
          </form>
        </div>

        <div className={styles.productStage}>
          <p className={styles.productCaption}>Inside your workspace</p>
          <div className={styles.window} aria-hidden>
            <div className={styles.windowBar}>
              <span className={styles.traffic}>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.windowTitle}>Command Center</span>
              <span className={styles.windowMeta}>Ready for you</span>
            </div>
            <div className={styles.windowBody}>
              <aside className={styles.miniSide}>
                <div className={styles.miniBrand}>
                  <img src="/brand/logo-mark.png" alt="" />
                  <span>EIP</span>
                </div>
                <div className={`${styles.miniNav} ${styles.miniActive}`}>Command</div>
                <div className={styles.miniNav}>Ellinea</div>
                <div className={styles.miniNav}>Connectors</div>
                <div className={styles.miniNav}>Settings</div>
              </aside>
              <div className={styles.miniMain}>
                <div className={styles.miniHeader}>
                  <div>
                    <div className={styles.miniOrg}>Your organization</div>
                    <div className={styles.miniRole}>Good to see you</div>
                  </div>
                  <div className={styles.miniStatus}>
                    <span className={styles.liveDot} />
                    Systems synced
                  </div>
                </div>

                <div className={styles.kpiRow}>
                  <div className={styles.kpi}>
                    <span>Revenue (MTD)</span>
                    <strong>KES {revenue.toFixed(1)}M</strong>
                    <em className={styles.up}>+4.2%</em>
                  </div>
                  <div className={styles.kpi}>
                    <span>Enterprise health</span>
                    <strong>{health}</strong>
                    <em>stable</em>
                  </div>
                  <div className={styles.kpi}>
                    <span>Open risks</span>
                    <strong>3</strong>
                    <em className={styles.warn}>review</em>
                  </div>
                </div>

                <div className={styles.ellineaPanel}>
                  <div className={styles.ellineaHead}>
                    <span>Ellinea AI</span>
                    <span className={styles.thinking}>with you</span>
                  </div>
                  <p className={styles.ellineaQ}>{PROMPTS[promptIndex]}</p>
                  <p className={styles.ellineaA}>
                    Two branches show inventory lag vs sales velocity. Recommend expedite PO-1842 and
                    rebalance Nyeri stock by Thursday.
                  </p>
                  <div className={styles.sources}>
                    <span>ERP · stock</span>
                    <span>POS · sales</span>
                    <span>CRM · pipeline</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.trust} aria-label="Platform posture">
        <p className={styles.trustLead}>
          You’re not replacing anything. <strong>You’re connecting what you already trust</strong> —
          and making it think together.
        </p>
        <div className={styles.trustMetrics}>
          <div>
            <strong>1 layer</strong>
            <span>above the stack</span>
          </div>
          <div>
            <strong>Ellinea</strong>
            <span>executive AI</span>
          </div>
          <div>
            <strong>RBAC</strong>
            <span>org-ready access</span>
          </div>
          <div>
            <strong>Live sync</strong>
            <span>connectors &amp; workflows</span>
          </div>
        </div>
      </section>

      <section id="capabilities" className={styles.capabilities}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionEyebrow}>Capabilities</p>
          <h2>Built like a system — not a brochure</h2>
          <p>What you can do once you’re inside — calmly, with clarity.</p>
        </div>
        <div className={styles.capGrid}>
          {CAPABILITIES.map((c) => (
            <article key={c.title} className={styles.capItem}>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.integrations} aria-label="Connectors">
        <div className={styles.sectionHead}>
          <p className={styles.sectionEyebrow}>Integration layer</p>
          <h2>Plugs into what you already run</h2>
        </div>
        <ul className={styles.connectorWall}>
          {CONNECTORS.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </section>

      <section id="ellinea" className={styles.ellineaSection}>
        <div className={styles.ellineaCopy}>
          <p className={styles.sectionEyebrow}>Ellinea AI</p>
          <h2>The mind of the platform</h2>
          <p>
            Natural-language Q&amp;A, daily executive briefs, and recommendations grounded in your
            connected data — so leadership sees the enterprise clearly.
          </p>
          <Link href="/register" className="btn btn-primary">
            Meet Ellinea
          </Link>
        </div>
        <div className={styles.promptDeck} aria-hidden>
          {PROMPTS.map((p) => (
            <div key={p} className={styles.promptCard}>
              <span>Ask Ellinea</span>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <img src="/brand/logo-mark.png" alt="" className={styles.finalMark} />
        <h2>You’re welcome here</h2>
        <p>Where Enterprise Systems Think Together.</p>
        <div className={styles.actions}>
          <Link href="/login" className="btn btn-primary">
            Welcome in
          </Link>
          <Link href="/register" className="btn btn-secondary">
            Create your organization
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <img src="/brand/logo-mark.png" alt="" />
          <span>
            Ellines <strong>EIP</strong>
          </span>
        </div>
        <p>Powered by Ellinea AI · Developed by Ellines Tech</p>
        <p className={styles.footerDomain}>eip.ellines.co.ke</p>
      </footer>
    </main>
  );
}
