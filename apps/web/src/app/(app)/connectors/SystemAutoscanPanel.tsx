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
  buildDbPortHints,
  buildLocalHttpTargets,
  buildOnlineTargets,
  candidateToWizardPrefill,
  parseScanTarget,
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

function dedupeCandidates(found: AutoscanCandidate[]): AutoscanCandidate[] {
  const uniq = new Map<string, AutoscanCandidate>();
  for (const c of found) {
    let key = c.url;
    try {
      const u = new URL(c.url);
      key = `${u.protocol}//${u.host}${u.pathname}|${c.recommendedCatalogId}|${c.isDbHint ? 'db' : 'http'}`;
    } catch {
      /* keep */
    }
    const prev = uniq.get(key);
    const prefer =
      !prev ||
      (c.exactPrefer && !prev.exactPrefer) ||
      (c.status && c.status < 400 && (!prev.status || prev.status >= 400));
    if (prefer) uniq.set(key, c);
  }
  // Exact URL IT entered first among HTTP candidates
  return [...uniq.values()].sort((a, b) => {
    if (a.exactPrefer && !b.exactPrefer) return -1;
    if (!a.exactPrefer && b.exactPrefer) return 1;
    return 0;
  });
}

export default function SystemAutoscanPanel({ busy, setBusy, onConnect, openSignal }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ScanMode>('local');
  const [baseUrl, setBaseUrl] = useState('');
  const [localHost, setLocalHost] = useState('');
  const [catalogForce, setCatalogForce] = useState('');
  const [includeDbHints, setIncludeDbHints] = useState(false);
  const [error, setError] = useState('');
  const [statusLine, setStatusLine] = useState('');
  const [candidates, setCandidates] = useState<AutoscanCandidate[]>([]);
  const [dbHints, setDbHints] = useState<AutoscanCandidate[]>([]);
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
    setDbHints([]);
    setMisses([]);
    setGuidance('');
    setBusy(true);

    const forced = catalogForce || undefined;
    const found: AutoscanCandidate[] = [];
    const hintList: AutoscanCandidate[] = [];
    const failed: string[] = [];

    try {
      if (mode === 'online' || mode === 'hybrid') {
        if (!baseUrl.trim()) {
          throw new Error(
            'Enter a public base URL for Online / Hybrid (e.g. https://erp.example.com). For private LAN SoRs use Local mode with the full URL.',
          );
        }
        const parsed = parseScanTarget(baseUrl, true);
        if (!parsed) throw new Error('Base URL is invalid.');

        // Private LAN cannot use edge — probe from this browser instead.
        if (parsed.isPrivateLan) {
          setStatusLine(
            'Private / LAN URL — Online edge cannot reach it. Probing the exact URL from this browser…',
          );
          const locals = buildLocalHttpTargets(baseUrl.trim());
          for (const t of locals.slice(0, 8)) {
            const probed = await probeUrlInBrowser(t.url, {
              timeoutMs: 2500,
              portHint: t.hint,
              forcedCatalogId: forced,
            });
            const c = toCandidate(probed, forced);
            if (c) {
              if (t.exact) c.exactPrefer = true;
              found.push(c);
            } else failed.push(`${t.url} — ${probed.error || 'no response'}`);
          }
        } else {
          const targets = buildOnlineTargets(baseUrl, forced);
          if (!targets.length) throw new Error('Base URL is invalid.');
          setStatusLine(`Ellinea probing ${targets.length} path(s) via edge (exact URL first)…`);
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
            if (c) {
              if (parsed.fullUrl === r.url) c.exactPrefer = true;
              found.push(c);
            } else failed.push(`${r.url} — ${r.error || 'no response'}`);
          }
        }
      }

      if (mode === 'local' || mode === 'hybrid') {
        const hostInput = localHost.trim() || (mode === 'hybrid' ? baseUrl.trim() : '');
        if (!hostInput) {
          throw new Error(
            'Enter a local/LAN host or full SoR URL (e.g. http://192.168.0.6/erp/login or …/api).',
          );
        }
        const locals = buildLocalHttpTargets(hostInput);
        if (!locals.length) throw new Error('Local / LAN host or URL is invalid.');

        setStatusLine(
          `Ellinea probing ${locals.length} local/LAN URL(s) from this browser (exact path first)…`,
        );
        for (const t of locals) {
          const probed = await probeUrlInBrowser(t.url, {
            timeoutMs: 2000,
            portHint: t.hint,
            forcedCatalogId: forced,
          });
          const c = toCandidate(probed, forced);
          if (c) {
            if (t.exact) c.exactPrefer = true;
            found.push(c);
          } else failed.push(`${t.url} — ${probed.error || 'closed / filtered'}`);
        }

        if (includeDbHints) {
          for (const t of buildDbPortHints(hostInput)) {
            const analyzed = analyzeProbePayload({
              url: t.url,
              reachable: true,
              opaque: true,
              isDbHint: true,
              portHint: `${t.hint} — catalog hint only (not HTTP-probed)`,
              catalogHint: t.catalogHint,
              forcedCatalogId: forced,
              snippet:
                'Common reporting-DB port listed because IT opted in. Ellinea did not open a database session or scan the disk.',
            });
            const c = toCandidate(analyzed, forced);
            if (c) {
              c.systemName = `${t.hint} · :${t.port}`;
              c.isDbHint = true;
              hintList.push(c);
            }
          }
        }
      }

      const list = dedupeCandidates(found).filter((c) => !c.isDbHint);
      setCandidates(list);
      setDbHints(hintList);
      setMisses(failed.slice(0, 12));

      const bonus = list.find((c) => c.catalogEntryId);
      const cat = forced
        ? SYSTEM_CATALOG.find((x) => x.id === forced)
        : bonus
          ? SYSTEM_CATALOG.find((x) => x.id === bonus.catalogEntryId)
          : undefined;

      if (list.length) {
        setGuidance(
          cat
            ? `Scan complete — reachability only (scan ≠ connect). ${list.length} candidate(s). Primary = the URL you entered. Optional hint: ${cat.name}. Click Connect to open the wizard with that base URL prefilled, then Test & Sync.`
            : `Scan complete — reachability only (scan ≠ connect). ${list.length} candidate(s) for any System of Record URL you entered. Click Connect → credentials → Test & Sync. EIP observes — it does not replace the SoR.`,
        );
        setStatusLine(
          `Scan complete · ${list.length} HTTP candidate(s)${hintList.length ? ` · ${hintList.length} DB hint(s)` : ''}.`,
        );
      } else {
        setGuidance(
          'Ellinea found no reachable HTTP surfaces. Paste the full SoR URL (any path) in Local mode for LAN systems, or a public HTTPS URL in Online mode. Confirm host/firewall. DB ports are opt-in hints only — not detections.',
        );
        setStatusLine('Scan complete · no HTTP candidates.');
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
            Owner/IT only. Works for any System of Record URL you enter. Scan checks reachability —
            it does not connect. Connect opens the install wizard; you still enter credentials and
            run Test & Sync.
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
            Modes: <strong>Local</strong> (browser → LAN/localhost; paste the full SoR URL) ·{' '}
            <strong>Online</strong> (public HTTPS via Pages edge) · <strong>Hybrid</strong>.{' '}
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
                <option value="local">Local / LAN URL</option>
                <option value="online">Online URL</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            {(mode === 'online' || mode === 'hybrid') && (
              <label>
                Public base URL (exact path honored)
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://erp.example.com/api or https://his.example.com"
                  disabled={busy}
                />
              </label>
            )}
            {(mode === 'local' || mode === 'hybrid') && (
              <label>
                Local / LAN host or full SoR URL
                <input
                  value={localHost}
                  onChange={(e) => setLocalHost(e.target.value)}
                  placeholder="http://192.168.0.6/app/login or http://host/api"
                  disabled={busy}
                />
              </label>
            )}
            <label>
              Catalog hint (optional bonus)
              <select
                value={catalogForce}
                onChange={(e) => setCatalogForce(e.target.value)}
                disabled={busy}
              >
                <option value="">None — generic REST/OpenAPI from URL</option>
                {SYSTEM_CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {(mode === 'local' || mode === 'hybrid') && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  flexDirection: 'row',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeDbHints}
                  onChange={(e) => setIncludeDbHints(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  Include DB port hints (5432 / 1433 / 3306) — catalog suggestions only, not
                  detections
                </span>
              </label>
            )}
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
              <div className={styles.panelLabel}>
                Reachable HTTP candidates · {candidates.length} (not connected yet)
              </div>
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
                        <strong>
                          {c.exactPrefer ? 'Primary · ' : ''}
                          {c.systemName}
                        </strong>
                        <p className={styles.lede} style={{ margin: '0.2rem 0' }}>
                          {c.url}
                          {c.status != null ? ` · HTTP ${c.status}` : ''}
                          {c.opaque ? ' · reachability only (CORS / body unread)' : ''}
                          {c.portHint ? ` · ${c.portHint}` : ''}
                          {' · '}
                          suggest <code>{c.recommendedCatalogId}</code>
                          {c.catalogEntryId ? (
                            <>
                              {' '}
                              · optional hint <code>{c.catalogEntryId}</code>
                            </>
                          ) : null}
                        </p>
                        <p className={styles.lede} style={{ margin: 0 }}>
                          {c.ellineaNote}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={adminStyles.primary}
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

          {dbHints.length ? (
            <details style={{ marginTop: '0.55rem' }}>
              <summary className={styles.panelLabel}>
                Possible reporting DBs · {dbHints.length} (hints only — not detected)
              </summary>
              <p className={styles.lede}>
                These ports are common for reporting replicas. Ellinea did not connect or prove a
                database is listening. Use only if IT knows a read-only SQL endpoint exists.
              </p>
              <ul className={adminStyles.structList}>
                {dbHints.map((c) => (
                  <li key={`db-${c.url}-${c.recommendedCatalogId}`}>
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
                          {c.url} · suggest <code>{c.recommendedCatalogId}</code>
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
                        Connect SQL
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
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

          <details style={{ marginTop: '0.75rem' }}>
            <summary className={styles.panelLabel}>Why didn&apos;t Ellinea connect?</summary>
            <ul className={adminStyles.structList}>
              <li>
                <span className={styles.lede}>
                  <strong>Scan ≠ connect.</strong> Auto-scan only checks whether a URL answers. It
                  never logs in, never stores credentials, and never syncs UEM data — for any SoR.
                </span>
              </li>
              <li>
                <span className={styles.lede}>
                  <strong>Next step:</strong> click <strong>Connect</strong> on the primary
                  candidate → install wizard (display name + endpoint prefilled from your URL) →
                  enter read-only credentials → <strong>Test</strong> → <strong>Sync</strong>.
                </span>
              </li>
              <li>
                <span className={styles.lede}>
                  <strong>Any path:</strong> paste the full SoR URL (
                  <code>/erp/login</code>, <code>/api</code>, <code>/App/Welcome.aspx</code>, …).
                  Exact URL is probed first; catalog names (HIS/ERP/CRM) are optional bonuses.
                </span>
              </li>
              <li>
                <span className={styles.lede}>
                  <strong>CORS / LAN:</strong> reachability-only (body unread) is expected when the
                  EIP site cannot read a cross-origin or http LAN page — not a failed connect.
                </span>
              </li>
              <li>
                <span className={styles.lede}>
                  <strong>DB ports</strong> (5432 / 1433 / 3306) are opt-in catalog hints, not live
                  detections.
                </span>
              </li>
            </ul>
          </details>
        </div>
      ) : null}
    </section>
  );
}
