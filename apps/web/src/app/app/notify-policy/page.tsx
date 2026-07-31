'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import settingsStyles from '../settings/settings.module.css';

type DeliveryPrefs = {
  emailDigest: boolean;
  emailAlerts: boolean;
  pushEnabled: boolean;
  digestCadence: 'daily' | 'weekly' | 'off';
};

const KEY = 'eip_notify_delivery';

const DEFAULTS: DeliveryPrefs = {
  emailDigest: false,
  emailAlerts: false,
  pushEnabled: false,
  digestCadence: 'off',
};

function readPrefs(): DeliveryPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as DeliveryPrefs) };
  } catch {
    return DEFAULTS;
  }
}

export default function NotifyPolicyPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [prefs, setPrefs] = useState<DeliveryPrefs>(DEFAULTS);
  const [notice, setNotice] = useState('');

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
    setAllowed(true);
    setPrefs(readPrefs());
  }, [router]);

  function persist(next: DeliveryPrefs) {
    setPrefs(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    setNotice('Delivery preferences saved on this browser. Email/push service wires next.');
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    persist(prefs);
  }

  if (!allowed) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking access…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Notifications</p>
          <h1>Delivery policy</h1>
          <p className={styles.lede}>
            Org email/push preferences. In-app Notification Center already works; outbound delivery
            needs <code>services/notification</code>.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/notifications" className={styles.ghostBtn}>
            Notification Center
          </Link>
          <Link href="/app/settings" className={styles.ghostBtn}>
            System Settings
          </Link>
        </div>
      </header>

      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={settingsStyles.card}>
        <form onSubmit={onSave}>
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>Email digest</strong>
              <p>Morning/weekly summary when the notification service is live.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.emailDigest}
              className={
                prefs.emailDigest
                  ? `${settingsStyles.switch} ${settingsStyles.switchOn}`
                  : settingsStyles.switch
              }
              onClick={() =>
                persist({
                  ...prefs,
                  emailDigest: !prefs.emailDigest,
                  digestCadence: !prefs.emailDigest ? 'daily' : 'off',
                })
              }
            >
              <span className={settingsStyles.switchKnob} />
            </button>
          </div>
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>Email alert spikes</strong>
              <p>Outbound mail when open alerts cross a threshold (service pending).</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.emailAlerts}
              className={
                prefs.emailAlerts
                  ? `${settingsStyles.switch} ${settingsStyles.switchOn}`
                  : settingsStyles.switch
              }
              onClick={() => persist({ ...prefs, emailAlerts: !prefs.emailAlerts })}
            >
              <span className={settingsStyles.switchKnob} />
            </button>
          </div>
          <div className={settingsStyles.toggleRow}>
            <div className={settingsStyles.toggleCopy}>
              <strong>Push (browser)</strong>
              <p>Web push — reserved until notification service + VAPID keys exist.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.pushEnabled}
              className={
                prefs.pushEnabled
                  ? `${settingsStyles.switch} ${settingsStyles.switchOn}`
                  : settingsStyles.switch
              }
              onClick={() => persist({ ...prefs, pushEnabled: !prefs.pushEnabled })}
            >
              <span className={settingsStyles.switchKnob} />
            </button>
          </div>
          <div className={settingsStyles.form} style={{ marginTop: '0.75rem' }}>
            <label>
              Digest cadence
              <select
                value={prefs.digestCadence}
                onChange={(e) =>
                  persist({
                    ...prefs,
                    digestCadence: e.target.value as DeliveryPrefs['digestCadence'],
                    emailDigest: e.target.value !== 'off',
                  })
                }
              >
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
          </div>
          <div className={settingsStyles.actions}>
            <button type="submit" className={adminStyles.primary}>
              Save delivery prefs
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
