'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { forgotPassword } from '@/lib/api';
import styles from '../login/login.module.css';
import { useAutofitScale } from '../login/use-autofit-scale';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);

  const brandFit = useAutofitScale([]);
  const formFit = useAutofitScale([error, message, resetToken]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setResetToken('');
    setLoading(true);
    try {
      const result = await forgotPassword(email);
      setMessage(result.message);
      if (result.resetToken) {
        setResetToken(result.resetToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
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
            <h1>Reset password</h1>
            <p className={styles.subtitle}>
              Enter your work email and we&apos;ll issue a one-time reset link.
            </p>
            {error ? <div className={styles.error}>{error}</div> : null}
            {message ? <div className={styles.success}>{message}</div> : null}
            {resetToken ? (
              <div className={styles.success}>
                <p style={{ margin: '0 0 0.65rem' }}>
                  Use this one-time link to set a new password (expires in 1 hour):
                </p>
                <Link
                  href={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                  className={styles.inlineAction}
                >
                  Continue to set new password →
                </Link>
              </div>
            ) : null}
            {!resetToken ? (
              <form onSubmit={onSubmit}>
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
                      placeholder="you@company.com"
                    />
                  </div>
                </div>
                <button className={styles.submit} type="submit" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            ) : null}
            <p className={styles.footer}>
              Remembered it? <Link href="/login">Sign in</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
