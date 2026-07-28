'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';
import styles from './home.module.css';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (getSession()) {
      router.replace('/app');
    }
  }, [router]);

  return (
    <main className={styles.gate}>
      <div className={styles.atmosphere} aria-hidden>
        <div className={styles.grid} />
        <div className={styles.glowA} />
        <div className={styles.glowB} />
        <div className={styles.orbit} />
      </div>

      <header className={styles.topbar}>
        <Link href="/" className={styles.brandLockup} aria-label="Ellines EIP home">
          <img src="/brand/logo-mark.png" alt="" className={styles.brandMark} />
          <span className={styles.brandText}>
            <span className={styles.brandEllines}>Ellines</span>
            <span className={styles.brandEip}>EIP</span>
          </span>
        </Link>
        <nav className={styles.topNav}>
          <Link href="/login" className={styles.navQuiet}>
            Sign in
          </Link>
          <Link href="/register" className={`${styles.navCta} btn btn-primary`}>
            Get started
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.markStage}>
          <div className={styles.markRing} aria-hidden />
          <img
            src="/brand/logo-mark.png"
            alt=""
            className={styles.heroMark}
          />
        </div>

        <div className={styles.copy}>
          <h1 className={styles.wordmark}>
            <span className={styles.wordEllines}>Ellines</span>{' '}
            <span className={styles.wordEip}>EIP</span>
          </h1>
          <p className={styles.productLine}>Enterprise Intelligence Platform</p>
          <p className={styles.tagline}>Where Enterprise Systems Think Together.</p>
          <p className={styles.support}>
            One intelligence layer over the systems you already run — guided by Ellinea AI.
          </p>

          <div className={styles.actions}>
            <Link href="/login" className={`btn btn-primary ${styles.actionPrimary}`}>
              Enter platform
            </Link>
            <Link href="/register" className={`btn btn-secondary ${styles.actionSecondary}`}>
              Create organization
            </Link>
          </div>

          <p className={styles.meta}>
            Powered by <strong>Ellinea AI</strong>
            <span className={styles.dot} aria-hidden />
            Ellines Tech
          </p>
        </div>
      </section>
    </main>
  );
}
