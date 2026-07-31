'use client';

import Link from 'next/link';
import {
  formatOrgDateTime,
  isOrgAdminRole,
} from '@ellines-eip/shared';
import {
  cacheOrgDateTimeSettings,
  fetchOrgDateTimeSettings,
  getSession,
  updateOrgDateTimeSettings,
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

export default function SystemSettingsPage() {
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);

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
    setOrgId(s.organization.id);
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workspace</p>
          <h1>System Settings</h1>
          <p className={styles.lede}>
            Display, density, and organization clock for the Work Console. Profile details stay
            separate.
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
            Theme, accent, and layout density apply only on this device.
          </p>
        </div>

        <div className={settingsStyles.grid}>
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

          <div className={settingsStyles.block}>
            <span className={settingsStyles.fieldLabel}>Layout density</span>
            <p className={settingsStyles.fieldHint}>
              Compact tightens padding across the Work Console content area.
            </p>
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
          </div>
        </div>
      </section>

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>Organization</p>
          <h2 className={settingsStyles.cardTitle}>Clock &amp; date</h2>
          <p className={settingsStyles.cardHint}>
            {orgAdmin
              ? 'Formats used in the sidebar clock and activity timestamps for everyone in this org.'
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
          <h2 className={settingsStyles.cardTitle}>Related settings</h2>
          <p className={settingsStyles.cardHint}>
            Personal identity and org administration live on their own screens.
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
