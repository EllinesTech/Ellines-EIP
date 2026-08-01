'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  fetchEnterpriseSummary,
  getSession,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import {
  buildDailyBriefText,
  buildEllineaRecommendations,
} from '@/lib/ellinea-engine';
import {
  detectHealthcareLabel,
  filterObjectsForCapability,
  getCapabilityBySlug,
  resolveCapabilityAvailability,
  type OrgSystemCapability,
} from '@/lib/org-system-catalog';
import { filterTodayTimelineEvents } from '@/lib/org-system';
import styles from '../../command.module.css';

function UnlockCta({ hint }: { hint?: string }) {
  return (
    <div className={styles.emptyCallout} style={{ marginTop: '0.75rem' }}>
      <div>
        <strong>Sync connector to unlock</strong>
        <p>
          {hint ||
            'EIP observes Systems of Record after Sync. It does not replace ERP / CRM / HIS data.'}
        </p>
      </div>
      <div className={styles.headerActions} style={{ justifyContent: 'flex-start', gap: '0.65rem' }}>
        <Link href="/app/connectors" className={styles.primaryLink}>
          Connectors →
        </Link>
        <Link href="/app/connectors#eip-autoscan" className={styles.primaryLink}>
          Auto-scan →
        </Link>
      </div>
    </div>
  );
}

function ObjectList({
  items,
}: {
  items: { id: string; kind: string; name: string; status?: string; branchId?: string }[];
}) {
  if (!items.length) return null;
  return (
    <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
      {items.map((item) => (
        <li key={item.id}>
          <span className={styles.dot} />
          <div>
            <strong>{item.name}</strong>
            <p>
              {item.kind}
              {item.status ? ` · ${item.status}` : ''}
              {item.branchId ? ` · branch ${item.branchId}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CapabilityBody({
  cap,
  summary,
  orgName,
  role,
}: {
  cap: OrgSystemCapability;
  summary: EnterpriseSummaryDto | null;
  orgName: string;
  role: string;
}) {
  const synced = summary?.status === 'synced';
  const av = resolveCapabilityAvailability(cap, summary);
  const objects = useMemo(() => filterObjectsForCapability(cap, summary), [cap, summary]);
  const events = useMemo(
    () => filterTodayTimelineEvents(summary?.timeline || []),
    [summary],
  );
  const brief = useMemo(() => {
    if (!synced || !summary) return '';
    return buildDailyBriefText(summary, {
      role,
      organizationName: orgName,
      useRoleContext: true,
    });
  }, [synced, summary, role, orgName]);
  const recs = useMemo(() => {
    if (!synced || !summary) return [];
    return buildEllineaRecommendations(summary, { role, useRoleContext: true });
  }, [synced, summary, role]);

  if (!synced) {
    return <UnlockCta hint={cap.emptyHint} />;
  }

  if (cap.view === 'brief') {
    return (
      <section className={styles.card} style={{ marginTop: '0.75rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Ellinea · brief</div>
            <h2 className={styles.cardTitle}>Daily brief · {summary!.connectorName}</h2>
          </div>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask Ellinea →
          </Link>
        </div>
        <pre className={styles.reportBody}>{brief}</pre>
      </section>
    );
  }

  if (cap.view === 'recommendations') {
    return (
      <section className={styles.card} style={{ marginTop: '0.75rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Ellinea · recommend</div>
            <h2 className={styles.cardTitle}>
              {recs.length ? `${recs.length} recommendation(s)` : 'No recommendations yet'}
            </h2>
          </div>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask workspace →
          </Link>
        </div>
        {recs.length ? (
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {recs.map((r) => (
              <li key={r.id}>
                <span className={styles.dot} />
                <div>
                  <strong>{r.title}</strong>
                  <p>
                    {r.rationale}
                    {r.confidence != null ? ` · confidence ${Math.round(r.confidence)}%` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.lede} style={{ marginTop: '0.55rem' }}>
            Sync richer UEM / alerts to unlock denser recommendations.
          </p>
        )}
      </section>
    );
  }

  if (cap.view === 'metrics' || cap.id === 'finance' || cap.id === 'alerts') {
    return (
      <>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span>Health</span>
            <strong>{summary!.healthScore}</strong>
            <em>{summary!.connectorName}</em>
          </div>
          <div className={styles.kpi}>
            <span>Open alerts</span>
            <strong className={summary!.openAlerts > 0 ? styles.warn : undefined}>
              {summary!.openAlerts}
            </strong>
            <em>Pressure</em>
          </div>
          <div className={styles.kpi}>
            <span>Open decisions</span>
            <strong>{summary!.openDecisions}</strong>
            <em>Needs action</em>
          </div>
          <div className={styles.kpi}>
            <span>Systems</span>
            <strong>{summary!.connectedSystems}</strong>
            <em>Connected</em>
          </div>
        </div>
        {cap.id === 'alerts' ? (
          <section className={styles.card} style={{ marginTop: '0.75rem' }}>
            <div className={styles.cardHead}>
              <div>
                <div className={styles.panelLabel}>Notifications · UEM</div>
                <h2 className={styles.cardTitle}>
                  {(summary!.model?.counts?.notifications ?? 0) > 0
                    ? `${summary!.model!.counts.notifications} notification count(s)`
                    : 'No notification objects in snapshot'}
                </h2>
              </div>
              <Link href="/app/notifications" className={styles.primaryLink}>
                Notification Center →
              </Link>
            </div>
            <ObjectList
              items={(summary!.model?.objects || []).filter((o) => o.kind === 'notification')}
            />
            {av.status === 'no-data' ? (
              <p className={styles.lede} style={{ marginTop: '0.55rem' }}>
                Alert pressure is zero and no notification objects yet — still observe-only.
              </p>
            ) : null}
          </section>
        ) : null}
        {cap.id === 'finance' && av.status === 'no-data' ? (
          <UnlockCta hint={cap.emptyHint} />
        ) : null}
        {cap.id === 'finance' ? (
          <p className={styles.lede} style={{ marginTop: '0.75rem' }}>
            Finance-specific GL / AP metrics appear when a finance SoR publishes them into UEM.
            Until then EIP surfaces health and decision pressure only.
          </p>
        ) : null}
      </>
    );
  }

  if (cap.view === 'link' && cap.id === 'decisions') {
    return (
      <section className={styles.card} style={{ marginTop: '0.75rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Decisions</div>
            <h2 className={styles.cardTitle}>
              {summary!.openDecisions
                ? `${summary!.openDecisions} open decision(s) in snapshot`
                : 'No open decisions in snapshot'}
            </h2>
          </div>
          <Link href="/app/approvals" className={styles.primaryLink}>
            Approvals queue →
          </Link>
        </div>
        <p className={styles.lede} style={{ marginTop: '0.55rem' }}>
          Snapshot decisions are observe-only. Work Approvals for local multi-step queues. Ellinea
          can frame which decisions to take first.
        </p>
        <div className={styles.headerActions} style={{ marginTop: '1rem', justifyContent: 'flex-start' }}>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask Ellinea about decisions →
          </Link>
        </div>
      </section>
    );
  }

  if (cap.view === 'timeline' || cap.id === 'clinical-today') {
    const noun = detectHealthcareLabel(summary) === 'patients' ? 'Clinical' : 'Service';
    return (
      <section className={styles.card} style={{ marginTop: '0.75rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>{noun} today</div>
            <h2 className={styles.cardTitle}>
              {events.length ? `${events.length} timeline hit(s)` : 'No today-oriented events'}
            </h2>
          </div>
          <Link href="/app/org-system/clients-today" className={styles.primaryLink}>
            Patients / clients →
          </Link>
        </div>
        {events.length ? (
          <ul className={styles.list} style={{ marginTop: '0.55rem' }}>
            {events.map((event, i) => (
              <li key={`${event.title}-${i}`}>
                <span className={styles.dot} />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <UnlockCta hint={cap.emptyHint} />
        )}
      </section>
    );
  }

  if (cap.view === 'stub') {
    const hintHits = objects;
    return (
      <section className={styles.card} style={{ marginTop: '0.75rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Stub · observe</div>
            <h2 className={styles.cardTitle}>
              {hintHits.length
                ? `${hintHits.length} related object(s)`
                : 'Waiting for SoR objects'}
            </h2>
          </div>
        </div>
        {hintHits.length ? <ObjectList items={hintHits} /> : <UnlockCta hint={cap.emptyHint} />}
      </section>
    );
  }

  return (
    <section className={styles.card} style={{ marginTop: '0.75rem' }}>
      <div className={styles.cardHead}>
        <div>
          <div className={styles.panelLabel}>UEM objects</div>
          <h2 className={styles.cardTitle}>
            {objects.length
              ? `${objects.length} object(s)`
              : av.status === 'no-data'
                ? 'Snapshot live — no matching objects yet'
                : 'No objects'}
          </h2>
        </div>
        {cap.id === 'assets' ? (
          <Link href="/app/fleet" className={styles.primaryLink}>
            Companion Fleet →
          </Link>
        ) : null}
        {cap.id === 'employees' ? (
          <Link href="/app/people" className={styles.primaryLink}>
            Companion People →
          </Link>
        ) : null}
      </div>
      {objects.length ? (
        <ObjectList items={objects} />
      ) : (
        <UnlockCta hint={cap.emptyHint} />
      )}
    </section>
  );
}

export default function OrgSystemCapabilityClient() {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params.capability === 'string' ? params.capability : '';
  const cap = getCapabilityBySlug(slug);

  const [allowed, setAllowed] = useState(false);
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('owner');
  const [error, setError] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!isOrgAdminRole(s.user.role)) {
      router.replace('/app');
      return;
    }
    if (!slug || !getCapabilityBySlug(slug)) {
      router.replace('/app/org-system');
      return;
    }
    setAllowed(true);
    setOrgName(s.organization.name);
    setRole(s.user.role);
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load snapshot'));
  }, [router, slug]);

  if (!allowed || !cap) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking access…</p>
      </div>
    );
  }

  const av = resolveCapabilityAvailability(cap, summary);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Organization System · EIP above SoR</p>
          <h1>{cap.title}</h1>
          <p className={styles.lede}>
            {cap.purpose} Observe-only — Ellines EIP does not replace the System of Record.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/org-system" className={styles.ghostBtn}>
            Catalog
          </Link>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
          <Link href="/app/connectors" className={styles.ghostBtn}>
            Connectors
          </Link>
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <div className={styles.opsRail}>
        <span className={styles.opsLink} style={{ cursor: 'default' }}>
          {av.badge}
        </span>
        {summary?.status === 'synced' ? (
          <span className={styles.opsLink} style={{ cursor: 'default' }}>
            {summary.connectorName}
          </span>
        ) : null}
      </div>

      <CapabilityBody cap={cap} summary={summary} orgName={orgName} role={role} />
    </div>
  );
}
