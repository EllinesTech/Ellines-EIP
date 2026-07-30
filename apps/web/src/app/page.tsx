'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';
import styles from './splash.module.css';

declare global {
  interface Window {
    __eipSplashBoot?: {
      t0: number;
      done: boolean;
    };
  }
}

const BOOT_MS = 3000;

export default function SplashPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [showBootUi, setShowBootUi] = useState(true);
  const [status, setStatus] = useState('Initializing your intelligent workspace…');

  useEffect(() => {
    document.documentElement.classList.add('eip-splash-lock');
    document.body.classList.add('eip-splash-lock');
    return () => {
      document.documentElement.classList.remove('eip-splash-lock');
      document.body.classList.remove('eip-splash-lock');
    };
  }, []);

  useEffect(() => {
    try {
      const s = getSession();
      if (s?.accessToken && s?.user?.id) {
        router.replace('/app');
      }
    } catch {
      // ignore
    }
  }, [router]);

  useEffect(() => {
    if (!window.__eipSplashBoot) {
      window.__eipSplashBoot = { t0: Date.now(), done: false };
    }

    const boot = window.__eipSplashBoot;
    if (boot.done) {
      setProgress(100);
      setReady(true);
      setShowBootUi(false);
      return;
    }

    let hideTimer = 0;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - boot.t0;
      const pct = Math.min(100, Math.floor((elapsed / BOOT_MS) * 100));
      setProgress(pct);

      if (pct >= 100) {
        boot.done = true;
        setProgress(100);
        setStatus('Initialized successfully');
        setReady(true);
        window.clearInterval(id);
        hideTimer = window.setTimeout(() => setShowBootUi(false), 650);
      }
    }, 50);

    return () => {
      window.clearInterval(id);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden>
        <img src="/brand/splash-bg.png" alt="" className={styles.bg} />
        <div className={styles.starsA} />
        <div className={styles.starsB} />
        <div className={styles.bgShade} />
      </div>

      <div className={styles.center}>
        <img src="/brand/logo-hex.png?v=3" alt="" className={styles.hex} />
        <h1 className={styles.title}>
          <span className={styles.ellines}>ELLINES</span>
          <span className={styles.eip}>EIP</span>
        </h1>
        <p className={styles.platform}>Enterprise Intelligence Platform</p>
        <p className={styles.slogan}>Where Enterprise Systems Think Together.</p>

        <div className={styles.poweredBlock}>
          <span className={styles.poweredLine} aria-hidden />
          <span className={styles.poweredLabel}>Powered by</span>
          <div className={styles.ellineaStack}>
            <img src="/brand/ellinea-icon.png" alt="" className={styles.ellineaIcon} />
            <strong className={styles.ellineaName}>Ellinea AI</strong>
            <span className={styles.ellineaTag}>Intelligence that empowers</span>
          </div>
          <span className={styles.poweredLine} aria-hidden />
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.bootBlock}>
          {ready ? (
            <Link href="/login/" className={styles.getStarted}>
              Get started
            </Link>
          ) : null}

          {showBootUi ? (
            <div className={ready ? styles.bootUiExit : undefined}>
              <p className={ready ? styles.statusOk : styles.loadingLabel} role="status" aria-live="polite">
                {status}
              </p>

              <div className={styles.barRow}>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${progress}%` }} />
                </div>
                <span className={styles.pct}>{progress}%</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
