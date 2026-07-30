'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, setSession, ssoRequest, ssoVerify } from '@/lib/api';
import styles from './login.module.css';
import { useAutofitScale } from './use-autofit-scale';

type AuthTab = 'account' | 'sso';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [ssoEmail, setSsoEmail] = useState('');
  const [ssoProvider, setSsoProvider] = useState('email');
  const [ssoToken, setSsoToken] = useState('');
  const [ssoMessage, setSsoMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const brandFit = useAutofitScale([]);
  const formFit = useAutofitScale([tab, error, showPassword, ssoToken, ssoMessage, ssoProvider]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await login(email, password);
      setSession(session);
      if (remember) {
        localStorage.setItem('eip_remember', '1');
      } else {
        localStorage.removeItem('eip_remember');
      }
      router.replace('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function completeSso(token: string) {
    const session = await ssoVerify(token);
    setSession(session);
    if (remember) {
      localStorage.setItem('eip_remember', '1');
    } else {
      localStorage.removeItem('eip_remember');
    }
    router.replace('/app');
  }

  async function onSsoRequest(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSsoMessage('');
    setSsoToken('');
    setLoading(true);
    try {
      const result = await ssoRequest(ssoEmail, ssoProvider);
      setSsoMessage(result.message);
      if (result.ssoToken) {
        setSsoToken(result.ssoToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO request failed');
    } finally {
      setLoading(false);
    }
  }

  async function onSsoContinue() {
    if (!ssoToken) return;
    setError('');
    setLoading(true);
    try {
      await completeSso(ssoToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  function startSocial(provider: 'google' | 'microsoft') {
    setTab('sso');
    setError('');
    setSsoMessage('');
    setSsoToken('');
    setSsoProvider(provider);
    if (email && !ssoEmail) {
      setSsoEmail(email);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.shellInner}>
      <section
        className={styles.brandPanel}
        ref={brandFit.containerRef}
      >
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

      <section
        className={styles.formPanel}
        ref={formFit.containerRef}
      >
        <div
          className={styles.card}
          ref={formFit.contentRef}
          style={formFit.contentStyle}
        >
          <h1>Welcome back</h1>
          <p className={styles.subtitle}>Sign in to continue to your workspace</p>

          <div className={styles.tabs} role="tablist" aria-label="Sign-in method">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'account'}
              className={tab === 'account' ? styles.tabOn : styles.tab}
              onClick={() => {
                setTab('account');
                setError('');
                setSsoMessage('');
                setSsoToken('');
                setSsoProvider('email');
              }}
            >
              Account Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'sso'}
              className={tab === 'sso' ? styles.tabOn : styles.tab}
              onClick={() => {
                setTab('sso');
                setError('');
                setSsoMessage('');
                setSsoToken('');
                setSsoProvider('email');
              }}
            >
              SSO Login
            </button>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {ssoMessage && tab === 'sso' ? <div className={styles.success}>{ssoMessage}</div> : null}

          {tab === 'account' ? (
            <form onSubmit={onSubmit}>
              <div className={styles.field}>
                <label htmlFor="email">Username / Email</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon} aria-hidden>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="8" r="4" />
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="password">Password</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon} aria-hidden>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                        <path d="M9.9 5.1A10.6 10.6 0 0 1 12 5c5 0 9.3 3.1 11 7.5a11.8 11.8 0 0 1-4.2 5.1" />
                        <path d="M6.1 6.1A11.8 11.8 0 0 0 1 12.5C2.7 16.9 7 20 12 20c1.4 0 2.7-.2 3.9-.7" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M2 12.5C3.7 8.1 8 5 12 5s8.3 3.1 10 7.5c-1.7 4.4-6 7.5-10 7.5S3.7 16.9 2 12.5z" />
                        <circle cx="12" cy="12.5" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.rowBetween}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span>Keep me logged in</span>
                </label>
                <Link href="/forgot-password" className={styles.forgot}>
                  Forgot password?
                </Link>
              </div>

              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <div className={styles.ssoBox}>
              <p>
                {ssoProvider === 'google'
                  ? 'Continue with Google using the work email on your EIP account.'
                  : ssoProvider === 'microsoft'
                    ? 'Continue with Microsoft using the work email on your EIP account.'
                    : 'Use your organization work email for passwordless SSO.'}
              </p>
              {!ssoToken ? (
                <form onSubmit={onSsoRequest}>
                  <div className={styles.field}>
                    <label htmlFor="ssoEmail">Work email</label>
                    <div className={styles.inputWrap}>
                      <input
                        id="ssoEmail"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@company.com"
                        value={ssoEmail}
                        onChange={(e) => setSsoEmail(e.target.value)}
                        style={{ paddingLeft: '0.85rem' }}
                      />
                    </div>
                  </div>
                  <button className={styles.submit} type="submit" disabled={loading}>
                    {loading
                      ? 'Requesting…'
                      : ssoProvider === 'google'
                        ? 'Continue with Google'
                        : ssoProvider === 'microsoft'
                          ? 'Continue with Microsoft'
                          : 'Continue with SSO'}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className={styles.submit}
                  disabled={loading}
                  onClick={onSsoContinue}
                >
                  {loading ? 'Signing in…' : 'Complete SSO sign-in →'}
                </button>
              )}
              {ssoProvider !== 'email' && !ssoToken ? (
                <button
                  type="button"
                  className={styles.socialBtn}
                  onClick={() => {
                    setSsoProvider('email');
                    setSsoMessage('');
                    setError('');
                  }}
                >
                  Use work email SSO instead
                </button>
              ) : null}
              {ssoProvider === 'email' && !ssoToken ? (
                <>
                  <button type="button" className={styles.socialBtn} onClick={() => startSocial('microsoft')}>
                    <MicrosoftIcon />
                    Continue with Microsoft
                  </button>
                  <button type="button" className={styles.socialBtn} onClick={() => startSocial('google')}>
                    <GoogleIcon />
                    Continue with Google
                  </button>
                </>
              ) : null}
            </div>
          )}

          {tab === 'account' ? (
            <>
              <div className={styles.divider}>
                <span>or continue with</span>
              </div>
              <div className={styles.socialRow}>
                <button type="button" className={styles.socialBtn} onClick={() => startSocial('microsoft')}>
                  <MicrosoftIcon />
                  Microsoft
                </button>
                <button type="button" className={styles.socialBtn} onClick={() => startSocial('google')}>
                  <GoogleIcon />
                  Google
                </button>
              </div>
            </>
          ) : null}

          <p className={styles.trust}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
            </svg>
            Secure. Intelligent. Trusted.
          </p>

          <p className={styles.footer}>
            New organization? <Link href="/register">Create one</Link>
          </p>
          <p className={styles.back}>
            <Link href="/">← Back to splash</Link>
          </p>
        </div>
      </section>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.9 2.4 2.7 6.6 2.7 11.7S6.9 21 12 21c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.5H12z" />
      <path fill="#34A853" d="M3.9 7.7l3.2 2.4C8 8 9.9 6.7 12 6.7c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 8.3 2.4 5.1 4.5 3.9 7.7z" opacity=".01" />
      <path fill="#FBBC05" d="M12 21c2.5 0 4.6-.8 6.1-2.2l-3-2.4c-.8.6-1.9 1-3.1 1-3.1 0-5.7-2-6.6-4.7l-3.2 2.5C4 18.7 7.7 21 12 21z" />
      <path fill="#4285F4" d="M20.6 12.3c0-.6-.1-1-.2-1.5H12v3.9h5.5c-.3 1.2-1.1 2.2-2.2 2.9l3 2.4c1.8-1.6 2.8-4 2.8-6.7z" />
      <path fill="#34A853" d="M5.4 14.7c-.2-.6-.4-1.3-.4-2s.1-1.4.4-2L2.2 8.2C1.6 9.3 1.3 10.5 1.3 11.7s.3 2.4.9 3.5l3.2-.5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect fill="#F25022" x="1" y="1" width="6.5" height="6.5" />
      <rect fill="#7FBA00" x="8.5" y="1" width="6.5" height="6.5" />
      <rect fill="#00A4EF" x="1" y="8.5" width="6.5" height="6.5" />
      <rect fill="#FFB900" x="8.5" y="8.5" width="6.5" height="6.5" />
    </svg>
  );
}
