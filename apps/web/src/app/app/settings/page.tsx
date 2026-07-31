'use client';

import Link from 'next/link';
import {
  formatOrgDateTime,
  isOrgAdminRole,
  isOrgOwnerRole,
} from '@ellines-eip/shared';
import {
  cacheOrgDateTimeSettings,
  fetchOrgDateTimeSettings,
  fetchOrgProfile,
  getSession,
  setSession,
  updateOrgDateTimeSettings,
  updateOrgProfile,
  type OrgDateTimeSettingsDto,
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

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setOrgAdmin(isOrgAdminRole(s.user.role));
    setIsOwner(isOrgOwnerRole(s.user.role));
    setOrgId(s.organization.id);
    setOrgName(s.organization.name);
    setOrgSlug(s.organization.slug);
    setUiPrefs(readUiPrefs());
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
            <p>Frame briefs and recommendations for your signed-in role (Owner, IT, exec…).</p>
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
              Prefer the server Ask path (OpenAI-compatible when a key is set). Always grounds on
              sync + Memory; falls back to template+RAG.
            </p>
          </div>
          <Toggle
            on={uiPrefs.ellineaUseLlm}
            label="Toggle Ellinea LLM RAG"
            onClick={() => persistUi({ ...uiPrefs, ellineaUseLlm: !uiPrefs.ellineaUseLlm })}
          />
        </div>
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
    </div>
  );
}
