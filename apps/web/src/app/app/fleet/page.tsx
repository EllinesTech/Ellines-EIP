'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  fetchEnterpriseSummary,
  getSession,
  type EnterpriseSummaryDto,
} from '@/lib/api';
import styles from '../command.module.css';

const FLEET_HINT =
  /\b(fleet|vehicle|car|truck|van|bus|gps|motor|plate|reg)\b/i;

function isFleetObject(obj: { kind: string; name: string; status?: string }) {
  if (obj.kind === 'asset') return true;
  const blob = `${obj.name} ${obj.status || ''}`;
  return FLEET_HINT.test(blob);
}

export default function FleetCompanionPage() {
  const [summary, setSummary] = useState<EnterpriseSummaryDto | null>(null);
  const [error, setError] = useState('');
  const [orgAdmin, setOrgAdmin] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s) setOrgAdmin(isOrgAdminRole(s.user.role));
    fetchEnterpriseSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load fleet'));
  }, []);

  const synced = summary?.status === 'synced';
  const assets = useMemo(() => {
    const objects = summary?.model?.objects || [];
    return objects.filter(isFleetObject);
  }, [summary]);
  const assetCount = summary?.model?.counts?.assets ?? assets.length;
  const alertPressure = synced ? summary!.openAlerts : 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mobile Work Companion</p>
          <h1>Fleet status</h1>
          <p className={styles.lede}>
            Company vehicles and assets from connected Systems of Record. EIP observes and alerts —
            it does not replace your fleet GPS or ERP.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.ghostBtn}>
              Connectors
            </Link>
          ) : null}
        </div>
      </header>

      {error ? <p className={styles.lede}>{error}</p> : null}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>Assets surfaced</span>
          <strong>{synced ? assetCount : '—'}</strong>
          <em>UEM asset objects (+ name hints)</em>
        </div>
        <div className={styles.kpi}>
          <span>Open alerts</span>
          <strong className={alertPressure > 0 ? styles.warn : undefined}>
            {synced ? alertPressure : '—'}
          </strong>
          <em>Ellinea can flag pressure when sync is live</em>
        </div>
      </div>

      <section className={styles.card} style={{ marginTop: '1rem' }}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.panelLabel}>Fleet list</div>
            <h2 className={styles.cardTitle}>
              {synced
                ? assets.length
                  ? `${assets.length} vehicles / assets`
                  : 'No fleet assets in this snapshot yet'
                : 'Awaiting connector sync'}
            </h2>
          </div>
        </div>

        {!synced ? (
          <div className={styles.emptyCallout} style={{ marginTop: '0.85rem' }}>
            <strong>No GPS / fleet SoR connected yet</strong>
            <p>
              Sync a connector that publishes UEM assets (or a GPS feed later). Until then this
              companion stays ready without inventing vehicle data.
            </p>
          </div>
        ) : null}

        {synced && !assets.length ? (
          <div className={styles.emptyCallout} style={{ marginTop: '0.85rem' }}>
            <strong>Snapshot live — no assets yet</strong>
            <p>
              Ask Ellinea about ops pressure, or connect a fleet/GPS source when available. EIP will
              not invent plates or locations.
            </p>
          </div>
        ) : null}

        {assets.length ? (
          <ul className={styles.list} style={{ marginTop: '0.85rem' }}>
            {assets.map((item) => (
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
        ) : null}

        <div className={styles.headerActions} style={{ marginTop: '1rem', justifyContent: 'flex-start' }}>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Ask Ellinea about fleet / alerts →
          </Link>
          <Link href="/app" className={styles.primaryLink}>
            Overview →
          </Link>
        </div>
      </section>
    </div>
  );
}
