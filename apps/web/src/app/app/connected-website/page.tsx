'use client';

/**
 * Connected Website — the organisation's own website, and only what has been
 * genuinely measured about it.
 *
 * WHY THIS IS A SEPARATE PAGE
 * ---------------------------
 * "The website is reachable" and "the business system provides orders" are
 * different facts. Conflating them is how a reachable homepage comes to imply
 * capabilities nobody discovered. This page shows layer 1 only (reachability,
 * HTTP, latency, TLS); business capabilities live under Connected Systems.
 *
 * NO INVENTED VALUES
 * ------------------
 *   - No website configured -> an explicit NOT CONNECTED state, never a
 *     placeholder domain and never a substitute site.
 *   - Never checked         -> NOT CHECKED, not "online".
 *   - Unreachable           -> the real outcome (DNS_FAILURE / TIMEOUT /
 *     OFFLINE / TLS_FAILURE), not a green dot.
 *   - Unmeasurable (no HTTP status because nothing answered, no TLS because the
 *     site is plain HTTP) -> UNKNOWN. Never 0, never "no".
 *
 * There is no "website health score" anywhere on this page, because there is no
 * evidence-based measurement behind one.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  checkConnectedWebsite,
  fetchOrganizationSources,
  type SourceWebsiteDto,
} from '@/lib/api';
import styles from './connected-website.module.css';

type LoadState = 'loading' | 'ready' | 'error';

/** A value that may be unmeasured. Rendered as UNKNOWN, never as 0. */
function Measured({ value, unit }: { value: number | string | null; unit?: string }) {
  if (value === null || value === '') {
    return <span className={styles.unknown}>UNKNOWN</span>;
  }
  return (
    <span className={styles.measured}>
      {value}
      {unit ? <span className={styles.unit}>{unit}</span> : null}
    </span>
  );
}

/** The real probe outcome, or NOT_CHECKED when no probe has ever run. */
function outcomeLabel(w: SourceWebsiteDto): { text: string; tone: string } {
  switch (w.outcome) {
    case 'ONLINE':
      return { text: 'ONLINE', tone: styles.toneOk };
    case 'OFFLINE':
      return { text: 'OFFLINE', tone: styles.toneBad };
    case 'DNS_FAILURE':
      return { text: 'DNS FAILURE', tone: styles.toneBad };
    case 'TLS_FAILURE':
      return { text: 'TLS FAILURE', tone: styles.toneBad };
    case 'TIMEOUT':
      return { text: 'TIMEOUT', tone: styles.toneBad };
    case 'NOT_CHECKED':
      return { text: 'NOT CHECKED', tone: styles.toneUnknown };
    default:
      // outcome === null means no measurement has EVER been taken.
      return { text: 'NOT CHECKED', tone: styles.toneUnknown };
  }
}

function tlsLabel(w: SourceWebsiteDto): { text: string; tone: string } {
  if (w.tls.valid === true) return { text: 'VALID', tone: styles.toneOk };
  if (w.tls.valid === false) return { text: 'INVALID', tone: styles.toneBad };
  // null = not measurable (plain HTTP, or the probe never completed).
  return { text: 'UNKNOWN', tone: styles.toneUnknown };
}

/** The measured website card. Every field renders UNKNOWN when unmeasured. */
function WebsiteCard({ website }: { website: SourceWebsiteDto }) {
  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2 className={styles.cardTitle}>{website.name}</h2>
            <a className={styles.url} href={website.url} target="_blank" rel="noreferrer noopener">
              {website.url}
            </a>
          </div>
          <span className={`${styles.badge} ${outcomeLabel(website).tone}`}>
            {outcomeLabel(website).text}
          </span>
        </div>

        <dl className={styles.grid}>
          <div className={styles.cell}>
            <dt className={styles.label}>HTTP status</dt>
            <dd className={styles.value}>
              <Measured value={website.httpStatus} />
            </dd>
          </div>
          <div className={styles.cell}>
            <dt className={styles.label}>Response time</dt>
            <dd className={styles.value}>
              <Measured value={website.responseTimeMs} unit="ms" />
            </dd>
          </div>
          <div className={styles.cell}>
            <dt className={styles.label}>TLS / SSL</dt>
            <dd className={styles.value}>
              <span className={`${styles.badge} ${tlsLabel(website).tone}`}>
                {tlsLabel(website).text}
              </span>
            </dd>
          </div>
          <div className={styles.cell}>
            <dt className={styles.label}>Last checked</dt>
            <dd className={styles.value}>
              {website.lastCheckedAt ? (
                new Date(website.lastCheckedAt).toLocaleString()
              ) : (
                <span className={styles.unknown}>NEVER CHECKED</span>
              )}
            </dd>
          </div>
          <div className={styles.cell}>
            <dt className={styles.label}>Freshness</dt>
            <dd className={styles.value}>
              <span className={styles.text}>{website.freshness.state}</span>
            </dd>
          </div>
          <div className={styles.cell}>
            <dt className={styles.label}>Final URL</dt>
            <dd className={styles.value}>
              <Measured value={website.finalUrl} />
            </dd>
          </div>
        </dl>

        {website.message ? <p className={styles.probeNote}>{website.message}</p> : null}

        <details className={styles.details}>
          <summary className={styles.summary}>TLS certificate details</summary>
          <dl className={styles.grid}>
            <div className={styles.cell}>
              <dt className={styles.label}>Issuer</dt>
              <dd className={styles.value}>
                <Measured value={website.tls.issuer} />
              </dd>
            </div>
            <div className={styles.cell}>
              <dt className={styles.label}>Subject</dt>
              <dd className={styles.value}>
                <Measured value={website.tls.subject} />
              </dd>
            </div>
            <div className={styles.cell}>
              <dt className={styles.label}>Valid to</dt>
              <dd className={styles.value}>
                <Measured
                  value={
                    website.tls.validTo
                      ? new Date(website.tls.validTo).toLocaleDateString()
                      : null
                  }
                />
              </dd>
            </div>
          </dl>
        </details>
      </section>

      <p className={styles.scopeNote}>
        These are technical measurements of the site only. What the business system exposes
        through its API is shown under Connected Systems, and is never inferred from an
        HTTP status.
      </p>
    </>
  );
}

export default function ConnectedWebsitePage() {
  const [state, setState] = useState<LoadState>('loading');
  const [website, setWebsite] = useState<SourceWebsiteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const graph = await fetchOrganizationSources();
      setWebsite(graph.website);
      setError(null);
      setState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the connected website.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setCheckNote(null);
    try {
      const result = await checkConnectedWebsite();
      if (result.state === 'NOT_CONNECTED') {
        setCheckNote('No website is configured for this organisation, so there is nothing to check.');
      } else if (result.state === 'BLOCKED') {
        setCheckNote(result.message ?? 'The probe was blocked by egress policy.');
      } else {
        setCheckNote(
          `Checked at ${result.checkedAt ? new Date(result.checkedAt).toLocaleString() : 'now'} - result: ${result.outcome ?? 'NOT_CHECKED'}.`,
        );
      }
      // Reload so the card shows the measurement that was just persisted.
      await load();
    } catch (e) {
      setCheckNote(e instanceof Error ? e.message : 'The check could not be completed.');
    } finally {
      setChecking(false);
    }
  }, [load]);

  if (state === 'loading') {
    return <main className={styles.page}>Loading the connected website…</main>;
  }

  if (state === 'error') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Connected Website</h1>
          <p className={styles.errorText}>{error}</p>
          <button type="button" className={styles.button} onClick={() => void load()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Connected Website</h1>
          <p className={styles.subtitle}>
            Your organisation&apos;s website and the measurements EIP has actually taken against it.
            Business capabilities are listed under Connected Systems — a site being reachable
            does not mean it provides orders, customers or payments.
          </p>
        </div>
        {website ? (
          <button
            type="button"
            className={styles.button}
            onClick={() => void runCheck()}
            disabled={checking}
          >
            {checking ? 'Checking…' : 'Check now'}
          </button>
        ) : null}
      </header>

      {checkNote ? <p className={styles.note}>{checkNote}</p> : null}

      {/* ── Explicit not-connected state ─────────────────────────────────── */}
      {!website ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>No website connected</h2>
            <span className={`${styles.badge} ${styles.toneUnknown}`}>NOT CONNECTED</span>
          </div>
          <p className={styles.body}>
            No website has been configured for this organisation, so EIP has nothing to measure.
            EIP does not substitute another site and does not report a status it has no evidence
            for. Ask your administrator to configure the website your business runs on.
          </p>
        </section>
      ) : (
        <WebsiteCard website={website} />
      )}
    </main>
  );
}

