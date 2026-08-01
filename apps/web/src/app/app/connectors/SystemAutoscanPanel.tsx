'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { probeAutoscanTargets } from '@/lib/api';
import {
  SYSTEM_CATALOG,
  type AutoscanCandidate,
  type ScanMode,
  type WizardPrefill,
  analyzeProbePayload,
  buildLocalTargets,
  buildOnlineTargets,
  candidateToWizardPrefill,
  isDbPort,
  probeUrlInBrowser,
  toCandidate,
} from '@/lib/system-autoscan';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

type Props = {
  busy: boolean;
  setBusy: (v: boolean) => void;
  onConnect: (prefill: WizardPrefill, ellineaNote: string) => void;
  /** When incremented, expand the scan form (e.g. header CTA). */
  openSignal?: number;
};

export default function SystemAutoscanPanel({ busy, setBusy, onConnect, openSignal }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ScanMode>('online');
  const [baseUrl, setBaseUrl] = useState('');
  const [localHost, setLocalHost] = useState('localhost');
  const [catalogForce, setCatalogForce] = useState('');
  const [error, setError] = useState('');
  const [statusLine, setStatusLine] = useState('');
  const [candidates, setCandidates] = useState<AutoscanCandidate[]>([]);
  const [misses, setMisses] = useState<string[]>([]);
  const [guidance, setGuidance] = useState('');

  useEffect(() => {
    if (openSignal && openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#eip-autoscan') setOpen(true);
  }, []);

  async function runScan() {
    setError('');
    setStatusLine('');
    setCandidates([]);
    setMisses([]);
    setGuidance('');
    setBusy(true);

    const forced = catalogForce || undefined;
    const found: AutoscanCandidate[] = [];
    const failed: string[] = [];

    try {
      if (mode === 'online' || mode === 'hybrid') {
        if (!baseUrl.trim()) {
          throw new Error('Enter a public base URL for Online / Hybrid (e.g. https://his.example.com).');
        }
        const targets = buildOnlineTargets(baseUrl, forced);
        if (!targets.length) throw new Error('Base URL is invalid.');
        setStatusLine(`Ellinea probing ${targets.length} online path(s) via edge…`);
        const edge = await probeAutoscanTargets({
          targets,
          catalogId: forced,
          timeoutMs: 2500,
        });
        for (const r of edge.results) {
          const analyzed = analyzeProbePayload({
            ...r,
            forcedCatalogId: forced,
          });
          const c = toCandidate(analyzed, forced);
          if (c) found.push(c);
          else failed.push(`${r.url} — ${r.error || 'no response'}`);
        }
      }

      if (mode === 'local' || mode === 'hybrid') {
        const locals = buildLocalTargets(localHost.trim() || 'localhost');
        setStatusLine(
          `Ellinea probing ${locals.length} local/LAN port(s) from this browser (IT-started only)…`,
        );
        for (const t of locals) {
          if (isDbPort(t.port)) {
            const analyzed = analyzeProbePayload({
              url: t.url,
              reachable: true,
              opaque: true,
              portHint: `${t.hint} — catalog hint only (not HTTP-probed)`,
              catalogHint: t.catalogHint,
              forcedCatalogId: forced,
              snippet:
                'DB port listed for IT awareness. Ellinea did not open a database session or scan the disk.',
            });
            analyzed.ellineaNote = `Port ${t.port} (${t.hint}) is a common reporting-DB port. Ellinea did not connect — use the read-only ${t.catalogHint || 'SQL'} connector with credentials IT controls. EIP observes; it does not replace the SoR.`;
            const c = toCandidate(analyzed, forced);
            if (c) {
              c.systemName = `${t.hint} · :${t.port}`;
              found.push(c);
            }
            continue;
          }
          const probed = await probeUrlInBrowser(t.url, {
            timeoutMs: 2000,
            portHint: t.hint,
            catalogHint: t.catalogHint,
            forcedCatalogId: forced,
          });
          const c = toCandidate(probed, forced);
          if (c) found.push(c);
          else failed.push(`${t.url} — ${probed.error || 'closed / filtered'}`);
        }
      }

      // Deduplicate by host+recommendedCatalogId+path root
      const uniq = new Map<string, AutoscanCandidate>();
      for (const c of found) {
        let key = c.url;
        try {
          const u = new URL(c.url);
          key = `${u.protocol}//${u.host}|${c.recommendedCatalogId}|${c.catalogEntryId || ''}`;
        } catch {
          /* keep */
        }
        const prev = uniq.get(key);
        if (!prev || (c.status && c.status < 400 && (!prev.status || prev.status >= 400))) {
          uniq.set(key, c);
        }
      }
      const list = [...uniq.values()];
      setCandidates(list);
      setMisses(failed.slice(0, 12));

      const cat = forced
        ? SYSTEM_CATALOG.find((x) => x.id === forced)
        : list.find((c) => c.catalogEntryId)
          ? SYSTEM_CATALOG.find(
              (x) => x.id === list.find((c) => c.catalogEntryId)?.catalogEntryId,
            )
          : undefined;

      if (list.length) {
        setGuidance(
          cat
            ? `Ellinea: ${list.length} reachable candidate(s). ${cat.blurb} ${cat.nextSteps}`
            : `Ellinea: ${list.length} reachable candidate(s). Pick Connect to open the install wizard with endpoint / catalog prefilled. Use read-only credentials — EIP observes, it does not replace the System of Record.`,
        );
        setStatusLine(`Scan complete · ${list.length} candidate(s).`);
      } else {
        setGuidance(
          'Ellinea found no reachable HTTP surfaces. Confirm the URL/host, firewall, or select Hospidia from the catalog and try again. For on-prem DB-only sites, use Local mode and the SQL connector hints.',
        );
        setStatusLine('Scan complete · no candidates.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.brief} style={{ marginBottom: '1.1rem' }}>
      <div className={styles.headerActions} style={{ justifyContent: 'space-between' }}>
        <div>
          <div className={styles.panelLabel}>Ellinea · Auto-scan for systems</div>
          <p className={styles.lede} style={{ marginBottom: 0 }}>
            Owner/IT only. Probe a URL or local host IT enters — no silent PC harvest, no disk
            crawl. Suggests connector type + install draft; you still supply credentials.
          </p>
        </div>
        <button
          type="button"
          className={adminStyles.primary}
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide auto-scan' : 'Auto-scan for systems'}
        </button>
      </div>

      {open ? (
        <div style={{ marginTop: '0.75rem' }}>
          <p className={styles.lede}>
            Modes: <strong>Online</strong> (public HTTPS paths via Pages edge) ·{' '}
            <strong>Local</strong> (browser → localhost/LAN ports you start) ·{' '}
            <strong>Hybrid</strong> (both).{' '}
            <Link href="/app/ellinea-console" className={styles.primaryLink}>
              Ellinea console
            </Link>
          </p>

          <div className={adminStyles.form} style={{ marginTop: '0.55rem' }}>
            <label>
              Mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ScanMode)}
                disabled={busy}
              >
                <option value="online">Online URL</option>
                <option value="local">Local host</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            {(mode === 'online' || mode === 'hybrid') && (
              <label>
                Base URL (IT-entered)
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://his.example.com"
                  disabled={busy}
                />
              </label>
            )}
            {(mode === 'local' || mode === 'hybrid') && (
              <label>
                Local / LAN host
                <input
                  value={localHost}
                  onChange={(e) => setLocalHost(e.target.value)}
                  placeholder="localhost or 192.168.x.x"
                  disabled={busy}
                />
              </label>
            )}
            <label>
              Catalog hint (optional)
              <select
                value={catalogForce}
                onChange={(e) => setCatalogForce(e.target.value)}
                disabled={busy}
              >
                <option value="">Auto-detect</option>
                {SYSTEM_CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={adminStyles.wizardActions}>
            <button
              type="button"
              className={adminStyles.primary}
              disabled={busy}
              onClick={() => void runScan()}
            >
              {busy ? 'Scanning…' : 'Start scan'}
            </button>
          </div>

          {error ? <p className={adminStyles.error}>{error}</p> : null}
          {statusLine ? <p className={adminStyles.notice}>{statusLine}</p> : null}
          {guidance ? <p className={styles.lede}>{guidance}</p> : null}

          {candidates.length ? (
            <div className={adminStyles.tableWrap} style={{ marginTop: '0.65rem' }}>
              <div className={styles.panelLabel}>Detected candidates · {candidates.length}</div>
              <ul className={adminStyles.structList}>
                {candidates.map((c) => (
                  <li key={`${c.url}-${c.recommendedCatalogId}`}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ flex: '1 1 220px' }}>
                        <strong>{c.systemName}</strong>
                        <p className={styles.lede} style={{ margin: '0.2rem 0' }}>
                          {c.url}
                          {c.status != null ? ` · HTTP ${c.status}` : ''}
                          {c.opaque ? ' · reachability only' : ''}
                          {c.portHint ? ` · ${c.portHint}` : ''}
                          {' · '}
                          suggest <code>{c.recommendedCatalogId}</code>
                        </p>
                        <p className={styles.lede} style={{ margin: 0 }}>
                          {c.ellineaNote}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        disabled={busy}
                        onClick={() =>
                          onConnect(candidateToWizardPrefill(c), c.ellineaNote)
                        }
                      >
                        Connect
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {misses.length ? (
            <details style={{ marginTop: '0.55rem' }}>
              <summary className={styles.panelLabel}>Unreachable probes · {misses.length}</summary>
              <ul className={adminStyles.structList}>
                {misses.map((m) => (
                  <li key={m}>
                    <span className={styles.lede}>{m}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
