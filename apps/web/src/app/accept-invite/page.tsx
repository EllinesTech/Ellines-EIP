'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { acceptInvite, setSession } from '@/lib/api';
import styles from '../login/login.module.css';
import { useAutofitScale } from '../login/use-autofit-scale';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const brandFit = useAutofitScale([]);
  const formFit = useAutofitScale([error, fullName, password, confirm, done]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!token) {
      setError('Invalid invite link — token is missing. Ask your administrator to resend.');
      return;
    }
    setLoading(true);
    try {
      const session = await acceptInvite(token, password, fullName.trim() || undefined);
      setSession(session);
      setDone(true);
      setTimeout(() => router.replace('/app'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invite');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.shellInner}>
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
            <h1>Accept invitation</h1>
            <p className={styles.subtitle}>
              Set your password to activate your Ellines EIP account.
            </p>

            {error ? <div className={styles.error}>{error}</div> : null}
            {done ? (
              <div className={styles.success}>
                Account activated — signing you in…
              </div>
            ) : null}

            {!token ? (
              <div className={styles.error}>
                Invalid invite link. Ask your administrator to send a fresh invitation.
              </div>
            ) : null}

            {token && !done ? (
              <form onSubmit={onSubmit}>
                <div className={styles.field}>
                  <label htmlFor="fullName">
                    Your full name{' '}
                    <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional — updates your profile)</span>
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id="fullName"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Leave blank to keep current name"
                      style={{ paddingLeft: '0.85rem' }}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="password">Choose a password</label>
                  <div className={styles.inputWrap}>
                    <input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      style={{ paddingLeft: '0.85rem' }}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="confirm">Confirm password</label>
                  <div className={styles.inputWrap}>
                    <input
                      id="confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      style={{ paddingLeft: '0.85rem' }}
                    />
                  </div>
                </div>

                <button
                  className={styles.submit}
                  type="submit"
                  disabled={loading || done}
                >
                  {loading ? 'Activating…' : 'Activate account'}
                </button>
              </form>
            ) : null}

            <p className={styles.footer}>
              <Link href="/login">Already have an account? Sign in</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Loading invitation…</p>
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
