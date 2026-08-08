'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPassword } from '@/lib/api';
import styles from '../login/login.module.css';
import { useAutofitScale } from '../login/use-autofit-scale';
import { Suspense } from 'react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = useMemo(() => searchParams?.get('token') || '', [searchParams]);

  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const brandFit = useAutofitScale([]);
  const formFit = useAutofitScale([error, message, token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const result = await resetPassword(token.trim(), password);
      setMessage(result.message);
      setTimeout(() => router.replace('/login'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
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
          </div>
        </section>

        <section className={styles.formPanel} ref={formFit.containerRef}>
          <div className={styles.card} ref={formFit.contentRef} style={formFit.contentStyle}>
            <h1>Set new password</h1>
            <p className={styles.subtitle}>Choose a strong password for your workspace.</p>
            {error ? <div className={styles.error}>{error}</div> : null}
            {message ? <div className={styles.success}>{message}</div> : null}
            <form onSubmit={onSubmit}>
              {!initialToken ? (
                <div className={styles.field}>
                  <label htmlFor="token">Reset token</label>
                  <div className={styles.inputWrap}>
                    <input
                      id="token"
                      required
                      minLength={32}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      style={{ paddingLeft: '0.85rem' }}
                      placeholder="Paste your reset token"
                    />
                  </div>
                </div>
              ) : null}
              <div className={styles.field}>
                <label htmlFor="password">New password</label>
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
              <button className={styles.submit} type="submit" disabled={loading || !!message}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
            <p className={styles.footer}>
              <Link href="/login">Back to sign in</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.shell}>
          <div className={styles.shellInner}>
            <section className={styles.formPanel}>
              <div className={styles.card}>
                <p className={styles.subtitle}>Loading…</p>
              </div>
            </section>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
