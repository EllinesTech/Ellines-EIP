'use client';

/**
 * Command Center source cards.
 *
 * The Command Center used to lead with "Connector health" and describe the whole
 * client as "Connectors: 1". That answers "how is EIP connected?" while the
 * client's actual question is "what is my organisation connected to?". So the
 * headline concepts are separated into three cards that cannot be confused:
 *
 *   CONNECTED WEBSITE   the org's own site, with only genuinely measured facts
 *   CONNECTED SYSTEMS   real business systems and what each actually exposes
 *   CONNECTORS          technical connection infrastructure beneath them
 *
 * Two rules are load-bearing here:
 *
 *  1. A connector is never presented AS a website or AS a system. The website
 *     card shows probe measurements (HTTP status, response time, TLS); the
 *     systems card shows discovered resources and record counts. Those are
 *     different facts and are never copied between the cards.
 *  2. Nothing here invents a value. No website configured renders an explicit
 *     NOT CONFIGURED state; an unmeasured field renders UNKNOWN; a failed fetch
 *     renders an error, because "we could not read it" and "you have nothing
 *     connected" look identical and mean opposite things.
 *
 * Data: GET /api/v1/orgs/me/sources — the same endpoint the Connected Website,
 * Connected Systems and Super Admin surfaces read, so they cannot disagree.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchOrganizationSources, type OrganizationSourceGraphDto } from '@/lib/api';
import { AvailabilityBadge, FreshnessTag, Measured } from './SourceModules';
import styles from './source-modules.module.css';

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.cell}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

function Card({
  title,
  hint,
  children,
  href,
  cta,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <section className={styles.card} style={{ marginBottom: 12 }} aria-label={title}>
      <div className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>{title}</h3>
          <p className={styles.cardHint}>{hint}</p>
        </div>
        {href && cta ? (
          <Link href={href} className={styles.cardLink}>
            {cta}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Honest count: a null count is "not established", which is not the same as 0. */
function Count({ value }: { value: number | null }) {
  return <Measured value={value} unknownLabel="UNKNOWN" />;
}

/**
 * CARD 1 — the organisation's own website.
 *
 * Renders ONLY probe measurements. It never shows the business system's record
 * counts, because "the catalogue API returned 15 books" is not evidence that the
 * website is reachable, and a 200 from the site is not evidence that any business
 * system is healthy.
 */
function WebsiteCard({ website }: { website: OrganizationSourceGraphDto['website'] }) {
  if (!website) {
    return (
      <Card
        title="Connected website"
        hint="The organisation's own site, measured directly."
        href="/app/connected-website"
        cta="Open Connected Website"
      >
        <span className={`${styles.badge} ${styles.toneUnknown}`}>WEBSITE NOT CONFIGURED</span>
        <p className={styles.body} style={{ marginTop: 8 }}>
          This organisation has not configured a website, so EIP has no site to measure. No
          substitute site is checked and no website figures are inferred from the business
          systems below.
        </p>
      </Card>
    );
  }

  const tone =
    website.outcome === 'ONLINE'
      ? styles.toneOk
      : website.outcome
        ? styles.toneBad
        : styles.toneUnknown;

  return (
    <Card
      title="Connected website"
      hint="The organisation's own site, measured directly."
      href="/app/connected-website"
      cta="Open Connected Website"
    >
      <dl className={styles.grid}>
        <Cell label="Website">
          <span className={styles.muted}>{website.url}</span>
        </Cell>
        <Cell label="Status">
          <span className={`${styles.badge} ${tone}`}>
            {website.outcome ? website.outcome.replace(/_/g, ' ') : 'NOT CHECKED'}
          </span>
        </Cell>
        <Cell label="HTTP status">
          <Measured value={website.httpStatus} />
        </Cell>
        <Cell label="Response time">
          <Measured value={website.responseTimeMs} unit="ms" />
        </Cell>
        <Cell label="TLS">
          {website.tls.valid === null ? (
            <span className={styles.unknown}>UNKNOWN</span>
          ) : website.tls.valid ? (
            <span className={`${styles.badge} ${styles.toneOk}`}>VALID</span>
          ) : (
            <span className={`${styles.badge} ${styles.toneBad}`}>INVALID</span>
          )}
        </Cell>
        <Cell label="Last checked">
          {website.lastCheckedAt ? (
            new Date(website.lastCheckedAt).toLocaleString()
          ) : (
            <span className={styles.unknown}>NEVER CHECKED</span>
          )}
        </Cell>
        <Cell label="Freshness">
          <FreshnessTag state={website.freshness.state} />
        </Cell>
      </dl>
      {website.message ? (
        <p className={styles.reason} style={{ marginTop: 8 }}>
          {website.message}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * CARD 2 — real business systems and what they actually expose.
 *
 * A system is only CONNECTED with evidence of a real retrieval. Resources are
 * listed exactly as discovery returned them (`books` stays `books`; nothing is
 * invented to fill a grid), and one connector serving many resources stays one
 * connection.
 */
function SystemsCard({ systems }: { systems: OrganizationSourceGraphDto['businessSystems'] }) {
  return (
    <Card
      title="Connected systems"
      hint="Real business systems, with the resources EIP can actually read."
      href="/app/connectors/systems"
      cta="Open Connected Systems"
    >
      {systems.length === 0 ? (
        <p className={styles.body}>
          <span className={`${styles.badge} ${styles.toneUnknown}`}>NO BUSINESS SYSTEMS</span>{' '}
          No business system source is configured for this organisation.
        </p>
      ) : (
        systems.map((system) => (
          <div key={system.id} style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13 }}>{system.name}</strong>
              <span
                className={`${styles.badge} ${
                  system.status === 'CONNECTED' ? styles.toneOk : styles.toneUnknown
                }`}
              >
                {system.status.replace(/_/g, ' ')}
              </span>
              <FreshnessTag state={system.freshness.state} />
              {system.completeness ? (
                <span className={styles.muted}>{system.completeness}</span>
              ) : (
                <span className={styles.unknown}>COMPLETENESS UNKNOWN</span>
              )}
            </div>
            <p className={styles.reason} style={{ marginTop: 4 }}>
              {system.statusEvidence}
            </p>

            <dl className={styles.grid} style={{ marginTop: 8 }}>
              <Cell label="Connector used">
                <span className={styles.muted}>
                  {system.connectors.length
                    ? system.connectors.map((c) => `${c.name} (${c.status})`).join(', ')
                    : 'NONE'}
                </span>
              </Cell>
              <Cell label="Resources discovered">
                <Count value={system.totalResourceCount} />
              </Cell>
              <Cell label="Resources readable">
                <Count value={system.availableResourceCount} />
              </Cell>
              <Cell label="Last successful retrieval">
                {system.lastSuccessfulRetrievalAt ? (
                  new Date(system.lastSuccessfulRetrievalAt).toLocaleString()
                ) : (
                  <span className={styles.unknown}>NEVER</span>
                )}
              </Cell>
            </dl>

            {system.resources.length ? (
              <ul className={styles.plainList} style={{ marginTop: 8 }}>
                {system.resources.map((resource) => (
                  <li
                    key={`${resource.connectorId}:${resource.id}`}
                    style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <AvailabilityBadge availability={resource.availability} />
                    <span className={styles.muted}>
                      {resource.label}
                      {resource.retrievedRecordCount === null
                        ? ' · records UNKNOWN'
                        : ` · ${resource.retrievedRecordCount} records`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.reason} style={{ marginTop: 8 }}>
                No resources discovered for this system yet.
              </p>
            )}

            {system.errors.length ? (
              <ul className={styles.errorList} style={{ marginTop: 8 }}>
                {system.errors.map((error, i) => (
                  <li key={i} className={styles.errorText}>
                    {error}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))
      )}
    </Card>
  );
}

/**
 * CARD 3 — technical connection infrastructure.
 *
 * A connector is the mechanism, not the thing. It reports what it serves, how it
 * authenticates, and whether it is syncing — and it is never used as a stand-in
 * for the website or the system it reads.
 */
function ConnectorsCard({ connectors }: { connectors: OrganizationSourceGraphDto['connectors'] }) {
  return (
    <Card
      title="Connectors"
      hint="Technical connections that read the systems above."
      href="/app/connectors/inventory"
      cta="Open Connectors"
    >
      {connectors.length === 0 ? (
        <p className={styles.body}>
          <span className={`${styles.badge} ${styles.toneUnknown}`}>NO CONNECTORS</span> No
          connector installation is configured for this organisation.
        </p>
      ) : (
        connectors.map((connector) => (
          <div key={connector.id} style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13 }}>{connector.name}</strong>
              <span className={`${styles.badge} ${styles.toneMuted}`}>{connector.type}</span>
              <span className={`${styles.badge} ${styles.toneMuted}`}>
                {connector.status.toUpperCase()}
              </span>
              <FreshnessTag state={connector.freshness.state} />
            </div>
            <dl className={styles.grid} style={{ marginTop: 8 }}>
              <Cell label="Connects to">
                <span className={styles.muted}>
                  {connector.sourceName ? (
                    <>
                      {connector.sourceName}
                      {connector.sourceType ? ` (${connector.sourceType})` : ''}
                    </>
                  ) : (
                    'UNASSIGNED'
                  )}
                </span>
              </Cell>
              <Cell label="Authentication">
                <span className={styles.muted}>
                  {connector.authentication.authType}
                  {connector.authentication.hasCredential
                    ? ' · credential stored'
                    : ' · no credential'}
                </span>
              </Cell>
              <Cell label="Last attempt">
                {connector.lastAttemptAt ? (
                  new Date(connector.lastAttemptAt).toLocaleString()
                ) : (
                  <span className={styles.unknown}>NEVER</span>
                )}
              </Cell>
              <Cell label="Last successful sync">
                {connector.lastSuccessfulSyncAt ? (
                  new Date(connector.lastSuccessfulSyncAt).toLocaleString()
                ) : (
                  <span className={styles.unknown}>NEVER</span>
                )}
              </Cell>
            </dl>
            {connector.lastError ? (
              <p className={styles.errorText} style={{ marginTop: 8 }}>
                {connector.lastError}
              </p>
            ) : connector.lastMessage ? (
              <p className={styles.reason} style={{ marginTop: 8 }}>
                {connector.lastMessage}
              </p>
            ) : null}
            {connector.resources.length ? (
              <p className={styles.muted} style={{ marginTop: 8 }}>
                Discovered through this connector:{' '}
                {connector.resources.map((r) => r.label).join(', ')}
              </p>
            ) : (
              <p className={styles.reason} style={{ marginTop: 8 }}>
                No resources discovered through this connector yet.
              </p>
            )}
          </div>
        ))
      )}
    </Card>
  );
}

/** Real source/capability totals. Unknown stays UNKNOWN. */
function Summary({ graph }: { graph: OrganizationSourceGraphDto }) {
  const { counts } = graph;
  return (
    <section className={styles.card} style={{ marginBottom: 12 }} aria-label="Source summary">
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>Your connected sources</h3>
        <p className={styles.cardHint}>Counted from real configuration and real retrievals.</p>
      </div>
      <dl className={styles.grid}>
        <Cell label="Websites">
          <Count value={counts.websites} />
        </Cell>
        <Cell label="Business systems">
          <Count value={counts.businessSystems} />
        </Cell>
        <Cell label="Connectors">
          <Count value={counts.connectors} />
        </Cell>
        <Cell label="Resources discovered">
          <Count value={counts.discoveredResources} />
        </Cell>
        <Cell label="Capabilities readable">
          <Count value={counts.capabilities.available} />
        </Cell>
        <Cell label="Partially readable">
          <Count value={counts.capabilities.partial} />
        </Cell>
        <Cell label="Not readable by EIP">
          <Count value={counts.capabilities.unavailable} />
        </Cell>
      </dl>
    </section>
  );
}

/**
 * The Command Center's source section: summary + the three cards.
 *
 * It fetches its own data so the Command Center cannot drift from the Connected
 * Website / Connected Systems / Super Admin surfaces, which read the same endpoint.
 */
export function SourceCards() {
  const [graph, setGraph] = useState<OrganizationSourceGraphDto | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      setGraph(await fetchOrganizationSources());
      setState('ready');
    } catch {
      // Reported, never rendered as "nothing connected" — those two look the
      // same on screen and mean opposite things.
      setState('unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <section className={styles.card} style={{ marginBottom: 12 }}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Your connected sources</h3>
        </div>
        <p className={styles.body}>Reading your organisation&apos;s real sources…</p>
      </section>
    );
  }

  if (state === 'unavailable' || !graph) {
    return (
      <section className={styles.card} style={{ marginBottom: 12 }}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Your connected sources</h3>
          <button type="button" className={styles.cardLink} onClick={() => void load()}>
            Retry
          </button>
        </div>
        <p className={styles.body}>
          <span className={`${styles.badge} ${styles.toneBad}`}>UNAVAILABLE</span> EIP could not
          read your organisation&apos;s sources. This is a read failure, not an empty result —
          nothing is being shown about your connections until it succeeds.
        </p>
      </section>
    );
  }

  // The "connect your first system" invitation is driven by REAL source state:
  // it only appears when this organisation genuinely has no source configured.
  const hasAnySource =
    graph.website !== null || graph.businessSystems.length > 0 || graph.connectors.length > 0;

  if (!hasAnySource) {
    return (
      <section className={styles.card} style={{ marginBottom: 12 }}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Your connected sources</h3>
        </div>
        <p className={styles.body} style={{ marginBottom: 8 }}>
          <span className={`${styles.badge} ${styles.toneUnknown}`}>NO SOURCES CONFIGURED</span>{' '}
          No website and no business system is configured for your organisation, so there is
          nothing for EIP to measure yet.
        </p>
        <Link href="/app/connectors" className={styles.cardLink}>
          Connect your first system
        </Link>
      </section>
    );
  }

  return (
    <>
      <Summary graph={graph} />
      <WebsiteCard website={graph.website} />
      <SystemsCard systems={graph.businessSystems} />
      <ConnectorsCard connectors={graph.connectors} />
    </>
  );
}


