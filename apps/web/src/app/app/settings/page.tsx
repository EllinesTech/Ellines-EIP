'use client';

import Link from 'next/link';
import {
  formatOrgDateTime,
  isOrgAdminRole,
  isOrgOwnerRole,
} from '@ellines-eip/shared';
import {
  cacheOrgDateTimeSettings,
  changePassword,
  fetchOrgDateTimeSettings,
  fetchOrgProfile,
  fetchWebhookSecret,
  getSession,
  listOrgAuditLogs,
  rotateWebhookSecret,
  setSession,
  updateOrgDateTimeSettings,
  updateOrgProfile,
  type AuditLogDto,
  type OrgDateTimeSettingsDto,
  type WebhookSecretDto,
} from '@/lib/api';
import {
  DEFAULT_UI_PREFS,
  readUiPrefs,
  writeUiPrefs,
  type UiAccent,
  type UiDensity,
  type UiPrefs,
  type UiTheme,
} from '@/lib/ui-prefs';
import {
  readOrgUiPolicy,
  writeOrgUiPolicy,
  type OrgUiPolicy,
} from '@/lib/org-ui-policy';
import { FormEvent, useEffect, useState } from 'react';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import settingsStyles from './settings.module.css';

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={on ? `${settingsStyles.switch} ${settingsStyles.switchOn}` : settingsStyles.switch}
      onClick={onClick}
    >
      <span className={settingsStyles.switchKnob} />
    </button>
  );
}

export default function SystemSettingsPage() {
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [orgUiPolicy, setOrgUiPolicy] = useState<OrgUiPolicy>({
    hideAskFromWorkUsers: false,
    allowWorkRolesOrgSystem: false,
  });
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const [timeFormat, setTimeFormat] = useState<OrgDateTimeSettingsDto['timeFormat']>('12h');
  const [dateStyle, setDateStyle] = useState<OrgDateTimeSettingsDto['dateStyle']>('short');
  const [clockPreview, setClockPreview] = useState(() =>
    formatOrgDateTime(new Date(), { timeFormat: '12h', dateStyle: 'short' }),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Security section state
  const [secBusy, setSecBusy] = useState(false);
  const [secError, setSecError] = useState('');
  const [secNotice, setSecNotice] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [webhook, setWebhook] = useState<WebhookSecretDto | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [recentAudit, setRecentAudit] = useState<AuditLogDto[]>([]);

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setOrgAdmin(isOrgAdminRole(s.user.role));
    setIsOwner(isOrgOwnerRole(s.user.role));
    setOrgId(s.organization.id);
    setOrgName(s.organization.name);
    setOrgSlug(s.organization.slug);
    setUiPrefs(readUiPrefs());
    setOrgUiPolicy(readOrgUiPolicy(s.organization.id));
    fetchOrgDateTimeSettings()
      .then((prefs) => {
        setTimeFormat(prefs.timeFormat);
        setDateStyle(prefs.dateStyle);
        cacheOrgDateTimeSettings(s.organization.id, prefs);
      })
      .catch(() => {
        /* keep defaults */
      });
    fetchOrgProfile()
      .then((org) => {
        setOrgName(org.name);
        setOrgSlug(org.slug);
      })
      .catch(() => {
        /* keep session values */
      });
    // Security section: load webhook + recent audit
    fetchWebhookSecret().then(setWebhook).catch(() => {/* ignore */});
    listOrgAuditLogs(8).then(setRecentAudit).catch(() => {/* ignore */});
  }, []);

  useEffect(() => {
    setClockPreview(formatOrgDateTime(new Date(), { timeFormat, dateStyle }));
  }, [timeFormat, dateStyle]);

  function persistUi(next: UiPrefs) {
    setUiPrefs(next);
    writeUiPrefs(next);
    setNotice('Display preferences updated on this device.');
    setError('');
  }

  function persistOrgPolicy(next: OrgUiPolicy) {
    if (!orgId) return;
    setOrgUiPolicy(next);
    writeOrgUiPolicy(orgId, next);
    setNotice('Org access preference updated on this device.');
    setError('');
  }

  async function onSaveClock(e: FormEvent) {
    e.preventDefault();
    if (!orgAdmin) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await updateOrgDateTimeSettings({ timeFormat, dateStyle });
      setTimeFormat(saved.timeFormat);
      setDateStyle(saved.dateStyle);
      if (orgId) cacheOrgDateTimeSettings(orgId, saved);
      setNotice('Organization clock and date format saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save clock settings');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveOrgName(e: FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await updateOrgProfile({ name: orgName });
      setOrgName(saved.name);
      setOrgSlug(saved.slug);
      const session = getSession();
      if (session) {
        setSession({
          ...session,
          organization: {
            ...session.organization,
            name: saved.name,
            slug: saved.slug,
          },
        });
      }
      setNotice('Organization display name saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save organization name');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workspace</p>
          <h1>System Settings</h1>
          <p className={styles.lede}>
            Appearance and density for this browser. Organization clock applies to everyone.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>This browser</p>
          <h2 className={settingsStyles.cardTitle}>Appearance</h2>
          <p className={settingsStyles.cardHint}>
            Theme, accent, and density — local only. Does not change other users.
          </p>
        </div>

        <div className={settingsStyles.appearanceGrid}>
          <div className={settingsStyles.block}>
            <span className={settingsStyles.fieldLabel}>Theme</span>
            <div className={settingsStyles.optionRow} role="group" aria-label="Theme">
              {(
                [
                  { id: 'dark', label: 'Dark' },
                  { id: 'dim', label: 'Dim' },
                ] as { id: UiTheme; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    uiPrefs.theme === opt.id
                      ? `${settingsStyles.option} ${settingsStyles.optionActive}`
                      : settingsStyles.option
                  }
                  onClick={() => persistUi({ ...uiPrefs, theme: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={settingsStyles.block}>
            <span className={settingsStyles.fieldLabel}>Layout density</span>
            <div className={settingsStyles.optionRow} role="group" aria-label="Layout density">
              {(
                [
                  { id: 'comfortable', label: 'Comfortable' },
                  { id: 'compact', label: 'Compact' },
                ] as { id: UiDensity; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    uiPrefs.density === opt.id
                      ? `${settingsStyles.option} ${settingsStyles.optionActive}`
                      : settingsStyles.option
                  }
                  onClick={() => persistUi({ ...uiPrefs, density: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className={settingsStyles.fieldHint}>
              Comfortable ≈ enterprise default. Compact packs more onto 1080p.
            </p>
          </div>

          <div className={settingsStyles.block} style={{ gridColumn: '1 / -1' }}>
            <span className={settingsStyles.fieldLabel}>Accent color</span>
            <div className={settingsStyles.optionRow} role="group" aria-label="Accent color">
              {(
                [
                  { id: 'violet', label: 'Violet', swatch: '#7c3aed' },
                  { id: 'blue', label: 'Blue', swatch: '#2563EB' },
                  { id: 'teal', label: 'Teal', swatch: '#0d9488' },
                ] as { id: UiAccent; label: string; swatch: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    uiPrefs.accent === opt.id
                      ? `${settingsStyles.option} ${settingsStyles.optionActive}`
                      : settingsStyles.option
                  }
                  onClick={() => persistUi({ ...uiPrefs, accent: opt.id })}
                >
                  <span
                    className={settingsStyles.swatch}
                    style={{ background: opt.swatch }}
                    aria-hidden
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '0.85rem' }}>
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>UEM count strip</strong>
              <p>Show branches / people / tasks / alerts under Overview KPIs.</p>
            </div>
            <Toggle
              on={uiPrefs.showUemStrip}
              label="Toggle UEM count strip"
              onClick={() => persistUi({ ...uiPrefs, showUemStrip: !uiPrefs.showUemStrip })}
            />
          </div>
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>KPI sparklines</strong>
              <p>Mini trend charts on Overview metric cards.</p>
            </div>
            <Toggle
              on={uiPrefs.showSparklines}
              label="Toggle KPI sparklines"
              onClick={() => persistUi({ ...uiPrefs, showSparklines: !uiPrefs.showSparklines })}
            />
          </div>
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>Reduce motion</strong>
              <p>Limit hover lifts and entrance animation in the Work Console.</p>
            </div>
            <Toggle
              on={uiPrefs.reduceMotion}
              label="Toggle reduce motion"
              onClick={() => persistUi({ ...uiPrefs, reduceMotion: !uiPrefs.reduceMotion })}
            />
          </div>
        </div>
      </section>

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>This browser</p>
          <h2 className={settingsStyles.cardTitle}>Notifications</h2>
          <p className={settingsStyles.cardHint}>
            Control what appears in the Notification Center feed and bell badge. Delete items from
            the feed itself (one or all).
          </p>
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Bell badge</strong>
            <p>Show the unread indicator on the top-bar notifications icon.</p>
          </div>
          <Toggle
            on={uiPrefs.notifyBadge}
            label="Toggle notification badge"
            onClick={() => persistUi({ ...uiPrefs, notifyBadge: !uiPrefs.notifyBadge })}
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Alert items</strong>
            <p>Include open alerts from the latest enterprise snapshot.</p>
          </div>
          <Toggle
            on={uiPrefs.notifyAlerts}
            label="Toggle alert notifications"
            onClick={() => persistUi({ ...uiPrefs, notifyAlerts: !uiPrefs.notifyAlerts })}
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Sync events</strong>
            <p>Include connector sync summaries in the feed.</p>
          </div>
          <Toggle
            on={uiPrefs.notifySyncEvents}
            label="Toggle sync notifications"
            onClick={() => persistUi({ ...uiPrefs, notifySyncEvents: !uiPrefs.notifySyncEvents })}
          />
        </div>
        <div className={settingsStyles.linkRow} style={{ marginTop: '0.65rem' }}>
          <Link href="/app/notifications" className={styles.primaryLink}>
            Open Notification Center →
          </Link>
          <Link href="/app/notify-policy" className={styles.primaryLink}>
            Email / push policy →
          </Link>
        </div>
      </section>

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>This browser</p>
          <h2 className={settingsStyles.cardTitle}>Ellinea AI</h2>
          <p className={settingsStyles.cardHint}>
            Preference home for Ellinea (brief, recs, memory, DNA, LLM+RAG). Everyday Ask is the
            floating panel; Owner/IT can open the operator console for API smoke tests.
          </p>
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Auto daily brief</strong>
            <p>Load the morning brief when you open Ask Ellinea.</p>
          </div>
          <Toggle
            on={uiPrefs.ellineaAutoBrief}
            label="Toggle Ellinea auto brief"
            onClick={() =>
              persistUi({ ...uiPrefs, ellineaAutoBrief: !uiPrefs.ellineaAutoBrief })
            }
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Recommendations</strong>
            <p>Show explainable insights with evidence and confidence scores.</p>
          </div>
          <Toggle
            on={uiPrefs.ellineaShowRecommendations}
            label="Toggle Ellinea recommendations"
            onClick={() =>
              persistUi({
                ...uiPrefs,
                ellineaShowRecommendations: !uiPrefs.ellineaShowRecommendations,
              })
            }
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Enterprise Memory</strong>
            <p>Ground answers with org-synced policy/decision notes (server + local cache).</p>
          </div>
          <Toggle
            on={uiPrefs.ellineaUseMemory}
            label="Toggle Ellinea memory"
            onClick={() =>
              persistUi({ ...uiPrefs, ellineaUseMemory: !uiPrefs.ellineaUseMemory })
            }
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Role context</strong>
            <p>
              Sharper Owner/IT vs exec/manager lenses for briefs, recommendations, and Ask actions
              (authority to decide vs escalate).
            </p>
          </div>
          <Toggle
            on={uiPrefs.ellineaRoleContext}
            label="Toggle Ellinea role context"
            onClick={() =>
              persistUi({ ...uiPrefs, ellineaRoleContext: !uiPrefs.ellineaRoleContext })
            }
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Recommendation feedback</strong>
            <p>Learn from Helpful / Dismiss votes to re-rank insights for this org.</p>
          </div>
          <Toggle
            on={uiPrefs.ellineaRecFeedback}
            label="Toggle Ellinea recommendation feedback"
            onClick={() =>
              persistUi({ ...uiPrefs, ellineaRecFeedback: !uiPrefs.ellineaRecFeedback })
            }
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Enterprise DNA</strong>
            <p>Derive how this org works from Memory, Approvals, and feedback.</p>
          </div>
          <Toggle
            on={uiPrefs.ellineaUseDna}
            label="Toggle Ellinea Enterprise DNA"
            onClick={() => persistUi({ ...uiPrefs, ellineaUseDna: !uiPrefs.ellineaUseDna })}
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>LLM + RAG</strong>
            <p>
              Prefer the server Ask path (OpenAI-compatible when a key is set). Grounds on sync,
              Memory, DNA, and alerts; answers stay SoR-safe (observe/wrap, never invent writes).
              Falls back to multi-hop template+RAG offline.
            </p>
          </div>
          <Toggle
            on={uiPrefs.ellineaUseLlm}
            label="Toggle Ellinea LLM RAG"
            onClick={() => persistUi({ ...uiPrefs, ellineaUseLlm: !uiPrefs.ellineaUseLlm })}
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Show Ask float</strong>
            <p>
              Personal control for the floating “Ask Ellinea AI” button. Full Ask workspace stays
              at /app/ellinea; Owner/IT Console stays at /app/ellinea-console.
            </p>
          </div>
          <Toggle
            on={uiPrefs.ellineaShowAskFloat}
            label="Toggle Ask Ellinea float"
            onClick={() =>
              persistUi({ ...uiPrefs, ellineaShowAskFloat: !uiPrefs.ellineaShowAskFloat })
            }
          />
        </div>
        {orgAdmin ? (
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>Hide Ask from work users</strong>
              <p>
                Owner/IT policy: hide the Ask float for executive / manager / member / viewer on
                this device. Console remains Owner/IT only.
              </p>
            </div>
            <Toggle
              on={orgUiPolicy.hideAskFromWorkUsers}
              label="Toggle hide Ask from work users"
              onClick={() =>
                persistOrgPolicy({
                  ...orgUiPolicy,
                  hideAskFromWorkUsers: !orgUiPolicy.hideAskFromWorkUsers,
                })
              }
            />
          </div>
        ) : null}
        {orgAdmin ? (
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>Connector auto-scan</strong>
              <p>
                Owner / IT Admin: paste any System of Record URL — scan checks reachability only
                (scan ≠ connect). Connect opens the wizard with that base URL; then Test &amp;
                Sync with credentials. Catalog names and DB ports are optional hints. Org-admin
                only for now.
              </p>
            </div>
            <Link href="/app/connectors#eip-autoscan" className={styles.primaryLink}>
              Open Auto-scan →
            </Link>
          </div>
        ) : null}
        {orgAdmin ? (
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>Allow work roles to open Organization System</strong>
              <p>
                Owner/IT policy (default off): when on, executives / managers / members / viewers
                on this device may open the Organization System catalog and its live UEM views.
                Owner/IT always retain access. EIP still observes Systems of Record — it does not
                replace them.
              </p>
            </div>
            <Toggle
              on={orgUiPolicy.allowWorkRolesOrgSystem}
              label="Toggle allow work roles Organization System"
              onClick={() =>
                persistOrgPolicy({
                  ...orgUiPolicy,
                  allowWorkRolesOrgSystem: !orgUiPolicy.allowWorkRolesOrgSystem,
                })
              }
            />
          </div>
        ) : null}
        {orgAdmin ? (
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>Organization System</strong>
              <p>
                Capability catalog over synced Systems of Record (reports, people, clients/patients,
                branches, alerts, Ellinea brief, companion deep links, connectors). EIP connects and
                observes — it does not replace ERP/CRM/HIS. Authorize work roles with the toggle
                above.
              </p>
            </div>
            <Link href="/app/org-system" className={styles.primaryLink}>
              Open Organization System →
            </Link>
          </div>
        ) : null}
        <div className={settingsStyles.linkRow} style={{ marginTop: '0.65rem' }}>
          <Link href="/app/ellinea" className={styles.primaryLink}>
            Open full Ask workspace →
          </Link>
          {orgAdmin ? (
            <Link href="/app/ellinea-console" className={styles.primaryLink}>
              Operator console (API) →
            </Link>
          ) : null}
        </div>
      </section>

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>This browser</p>
          <h2 className={settingsStyles.cardTitle}>Approvals</h2>
          <p className={settingsStyles.cardHint}>
            Local approval queue until the workflow service ships.
          </p>
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Show in nav</strong>
            <p>Include Approvals in the Work Console sidebar.</p>
          </div>
          <Toggle
            on={uiPrefs.showApprovalsNav}
            label="Toggle Approvals nav"
            onClick={() =>
              persistUi({ ...uiPrefs, showApprovalsNav: !uiPrefs.showApprovalsNav })
            }
          />
        </div>
        <div className={settingsStyles.toggleRow}>
          <div className={settingsStyles.toggleCopy}>
            <strong>Seed from decisions</strong>
            <p>Create a pending approval when the snapshot has open decisions.</p>
          </div>
          <Toggle
            on={uiPrefs.approvalsSeedFromDecisions}
            label="Toggle approvals seed from decisions"
            onClick={() =>
              persistUi({
                ...uiPrefs,
                approvalsSeedFromDecisions: !uiPrefs.approvalsSeedFromDecisions,
              })
            }
          />
        </div>
        <div className={settingsStyles.linkRow} style={{ marginTop: '0.65rem' }}>
          <Link href="/app/approvals" className={styles.primaryLink}>
            Open Approvals →
          </Link>
        </div>
      </section>

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>Organization</p>
          <h2 className={settingsStyles.cardTitle}>Organization profile</h2>
          <p className={settingsStyles.cardHint}>
            {isOwner
              ? 'Display name shown across the Work Console. Slug stays fixed for URLs and integrations.'
              : 'Organization name is Owner-managed. Slug is read-only.'}
          </p>
        </div>
        <form onSubmit={(e) => void onSaveOrgName(e)}>
          <div className={settingsStyles.form}>
            <label>
              Display name
              <input
                value={orgName}
                disabled={!isOwner || busy}
                onChange={(e) => setOrgName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label>
              Slug
              <input value={orgSlug} readOnly aria-label="Organization slug" />
            </label>
          </div>
          {isOwner ? (
            <div className={settingsStyles.actions}>
              <button type="submit" className={adminStyles.primary} disabled={busy}>
                {busy ? 'Saving…' : 'Save organization name'}
              </button>
            </div>
          ) : null}
        </form>
      </section>

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>Organization</p>
          <h2 className={settingsStyles.cardTitle}>Clock &amp; date</h2>
          <p className={settingsStyles.cardHint}>
            {orgAdmin
              ? 'Formats for sidebar clock and activity timestamps across the org.'
              : 'Organization clock format. Only Owner or IT Admin can change it.'}
          </p>
        </div>

        <form onSubmit={(e) => void onSaveClock(e)}>
          <div className={settingsStyles.form}>
            <label>
              Time format
              <select
                value={timeFormat}
                disabled={!orgAdmin || busy}
                onChange={(e) =>
                  setTimeFormat(e.target.value as OrgDateTimeSettingsDto['timeFormat'])
                }
              >
                <option value="12h">12-hour (7:14 PM)</option>
                <option value="24h">24-hour (19:14)</option>
              </select>
            </label>
            <label>
              Date style
              <select
                value={dateStyle}
                disabled={!orgAdmin || busy}
                onChange={(e) =>
                  setDateStyle(e.target.value as OrgDateTimeSettingsDto['dateStyle'])
                }
              >
                <option value="short">Short (Fri 31 Jul)</option>
                <option value="medium">Medium (31 Jul 2026)</option>
                <option value="log">Log (2026-07-31)</option>
              </select>
            </label>
            <label>
              Preview
              <input
                readOnly
                value={`${clockPreview.day} · ${clockPreview.time}`}
                aria-label="Clock preview"
              />
            </label>
          </div>
          {orgAdmin ? (
            <div className={settingsStyles.actions}>
              <button type="submit" className={adminStyles.primary} disabled={busy}>
                {busy ? 'Saving…' : 'Save clock settings'}
              </button>
            </div>
          ) : null}
        </form>
      </section>

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>Account</p>
          <h2 className={settingsStyles.cardTitle}>Related</h2>
          <p className={settingsStyles.cardHint}>
            Profile and admin tools live on their own screens.
          </p>
        </div>
        <div className={settingsStyles.linkRow}>
          <Link href="/app/profile" className={styles.primaryLink}>
            Edit profile →
          </Link>
          {orgAdmin ? (
            <Link href="/app/admin" className={styles.primaryLink}>
              Org Admin →
            </Link>
          ) : null}
          {orgAdmin ? (
            <Link href="/app/connectors" className={styles.primaryLink}>
              Connectors →
            </Link>
          ) : null}
        </div>
      </section>

      {/* Security section */}
      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>Account security</p>
          <h2 className={settingsStyles.cardTitle}>Password &amp; security</h2>
          <p className={settingsStyles.cardHint}>
            Change your password. If you're a demo account, create a unique password before
            sharing access.
          </p>
        </div>
        {secError ? <p className={adminStyles.error}>{secError}</p> : null}
        {secNotice ? <p className={adminStyles.notice}>{secNotice}</p> : null}
        <form
          className={settingsStyles.form}
          onSubmit={async (e) => {
            e.preventDefault();
            if (newPw !== confirmPw) { setSecError('New passwords do not match'); return; }
            if (newPw.length < 8) { setSecError('Password must be at least 8 characters'); return; }
            setSecBusy(true); setSecError(''); setSecNotice('');
            try {
              await changePassword({ currentPassword: currentPw, newPassword: newPw });
              setSecNotice('Password changed successfully.');
              setCurrentPw(''); setNewPw(''); setConfirmPw('');
            } catch (err) {
              setSecError(err instanceof Error ? err.message : 'Password change failed');
            } finally { setSecBusy(false); }
          }}
        >
          <label>
            Current password
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" />
          </label>
          <label>
            New password
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          <label>
            Confirm new password
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required autoComplete="new-password" />
          </label>
          <div className={settingsStyles.actions}>
            <button type="submit" className={adminStyles.primary} disabled={secBusy}>
              {secBusy ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>

        {/* Recent login activity */}
        {recentAudit.length > 0 ? (
          <div style={{ marginTop: '1.25rem' }}>
            <div className={settingsStyles.fieldLabel} style={{ marginBottom: '0.5rem' }}>Recent account activity</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {recentAudit.map((log) => (
                <li key={log.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', fontSize: '0.8rem' }}>
                  <span style={{
                    padding: '0.1rem 0.4rem', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700,
                    background: log.action.startsWith('auth') ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                    color: log.action.startsWith('auth') ? '#93c5fd' : 'var(--c-muted)',
                    border: `1px solid ${log.action.startsWith('auth') ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    flexShrink: 0,
                  }}>{log.action}</span>
                  <span style={{ color: 'var(--c-muted)', fontSize: '0.72rem' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/app/audit" className={styles.primaryLink} style={{ fontSize: '0.78rem', display: 'inline-block', marginTop: '0.5rem' }}>
              Full audit log →
            </Link>
          </div>
        ) : null}
      </section>

      {/* Webhook & API section — Owner/IT only */}
      {orgAdmin ? (
        <section className={settingsStyles.card}>
          <div className={settingsStyles.cardHead}>
            <p className={settingsStyles.cardEyebrow}>Integration</p>
            <h2 className={settingsStyles.cardTitle}>Webhooks &amp; API access</h2>
            <p className={settingsStyles.cardHint}>
              Webhook endpoint for System B to push enterprise events directly into EIP. Rotate the
              secret if it is compromised. The full secret is shown only once after rotation.
            </p>
          </div>

          {webhook ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', fontSize: '0.85rem' }}>
                <div>
                  <div className={settingsStyles.fieldLabel}>Endpoint</div>
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.25rem 0.5rem', borderRadius: 5, fontSize: '0.8rem', userSelect: 'all' }}>
                    {webhook.endpoint}
                  </code>
                </div>
                <div>
                  <div className={settingsStyles.fieldLabel}>Secret</div>
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.25rem 0.5rem', borderRadius: 5, fontSize: '0.8rem', userSelect: 'all' }}>
                    {webhook.secret || webhook.secretPreview || (webhook.configured ? '••••••••' : 'Not configured')}
                  </code>
                </div>
                <div>
                  <div className={settingsStyles.fieldLabel}>Status</div>
                  <span style={{
                    padding: '0.1rem 0.45rem', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600,
                    background: webhook.configured ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)',
                    color: webhook.configured ? '#6ee7b7' : '#94a3b8',
                    border: `1px solid ${webhook.configured ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.3)'}`,
                  }}>
                    {webhook.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={adminStyles.primary}
                  disabled={webhookBusy}
                  onClick={async () => {
                    if (!confirm('Rotate webhook secret? The old secret will stop working immediately.')) return;
                    setWebhookBusy(true);
                    try {
                      const updated = await rotateWebhookSecret();
                      setWebhook(updated);
                      setSecNotice('Webhook secret rotated. Save the new secret — it is shown only once.');
                    } catch (err) {
                      setSecError(err instanceof Error ? err.message : 'Rotation failed');
                    } finally { setWebhookBusy(false); }
                  }}
                >
                  {webhookBusy ? 'Rotating…' : 'Rotate secret'}
                </button>
                <Link href="/app/connectors" className={styles.ghostBtn} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  Connectors →
                </Link>
              </div>
              {webhook.headers ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>
                  Required header: <code>X-EIP-Webhook-Secret: {'{your-secret}'}</code>
                </div>
              ) : null}
            </div>
          ) : (
            <p className={styles.lede}>Loading webhook config…</p>
          )}
        </section>
      ) : null}

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>Account</p>
          <h2 className={settingsStyles.cardTitle}>Related</h2>
          <p className={settingsStyles.cardHint}>
            Profile and admin tools live on their own screens.
          </p>
        </div>
        <div className={settingsStyles.linkRow}>
          <Link href="/app/profile" className={styles.primaryLink}>Edit profile →</Link>
          <Link href="/app/documents" className={styles.primaryLink}>Document Hub →</Link>
          {orgAdmin ? <Link href="/app/admin" className={styles.primaryLink}>Org Admin →</Link> : null}
          {orgAdmin ? <Link href="/app/connectors" className={styles.primaryLink}>Connectors →</Link> : null}
          {orgAdmin ? <Link href="/app/audit" className={styles.primaryLink}>Audit Center →</Link> : null}
        </div>
      </section>
    </div>
  );
}
