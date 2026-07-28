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
    <main className={styles.hero}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.content}>
        <img
          src="/brand/logo-full.png"
          alt="Ellines EIP — Enterprise Intelligence Platform"
          className={styles.logo}
        />
        <h1 className={styles.headline}>
          Where Enterprise Systems
          <br />
          Think Together.
        </h1>
        <p className={styles.support}>
          Ellines EIP connects your existing systems into one intelligence layer —
          powered by Ellinea AI.
        </p>
        <div className={styles.actions}>
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-secondary">
            Create organization
          </Link>
        </div>
        <p className={styles.powered}>Powered by Ellinea AI</p>
      </div>
    </main>
  );
}
