'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { register, setSession } from '@/lib/api';
import styles from '../login/login.module.css';
import { useAutofitScale } from '../login/use-autofit-scale';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const brandFit = useAutofitScale([]);
  const formFit = useAutofitScale([error, fullName, organizationName, email, password]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await register({ email, password, fullName, organizationName });
      setSession(session);
      router.replace('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.brandPanel} ref={brandFit.containerRef}>
        <div
          className={styles.brandStack}
          ref={brandFit.contentRef}
          style={brandFit.contentStyle}
        >
          <img src="/brand/logo-hex.png?v=3" alt="" className={styles.hex} />
          <div className={styles.wordmark}>
            <span className={styles.ellines}>ELLINES</span>
            <span className={styles.eip}>EIP</span>
          </div>
          <p className={styles.platform}>Enterprise Intelligence Platform</p>
          <p className={styles.slogan}>Where Enterprise Systems Think Together.</p>

          <div className={styles.poweredBlock}>
            <span className={styles.poweredLine} aria-hidden />
            <div className={styles.poweredInner}>
              <span className={styles.poweredLabel}>Powered by</span>
              <div className={styles.ellineaStack}>
                <img src="/brand/ellinea-icon.png" alt="" className={styles.ellineaIcon} />
                <strong className={styles.ellineaName}>Ellinea AI</strong>
                <span className={styles.ellineaTag}>Intelligence that empowers</span>
              </div>
            </div>
            <span className={styles.poweredLine} aria-hidden />
          </div>
        </div>
      </section>

      <section className={styles.formPanel} ref={formFit.containerRef}>
        <div className={styles.card} ref={formFit.contentRef} style={formFit.contentStyle}>
          <h1>Create organization</h1>
          <p className={styles.subtitle}>Open a new Ellines EIP workspace</p>
          {error ? <div className={styles.error}>{error}</div> : null}
          <form onSubmit={onSubmit}>
            <div className={styles.field}>
              <label htmlFor="fullName">Your full name</label>
              <div className={styles.inputWrap}>
                <input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ paddingLeft: '0.85rem' }}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="organizationName">Organization name</label>
              <div className={styles.inputWrap}>
                <input
                  id="organizationName"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  style={{ paddingLeft: '0.85rem' }}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="email">Work email</label>
              <div className={styles.inputWrap}>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ paddingLeft: '0.85rem' }}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Password</label>
              <div className={styles.inputWrap}>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingLeft: '0.85rem' }}
                />
              </div>
            </div>
            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create organization'}
            </button>
          </form>
          <p className={styles.footer}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
