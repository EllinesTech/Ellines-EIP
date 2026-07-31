'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { useRouter } from 'next/navigation';
import {
  deliverNotification,
  fetchNotifyDeliveryPolicy,
  getSession,
  listNotifyOutbox,
  saveNotifyDeliveryPolicy,
  type NotifyDeliveryPolicyDto,
  type NotifyOutboxItemDto,
} from '@/lib/api';
import { publishEnterpriseEvent } from '@/lib/event-bus';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import settingsStyles from '../settings/settings.module.css';

type DeliveryPrefs = NotifyDeliveryPolicyDto;

const KEY = 'eip_notify_delivery';

const DEFAULTS: DeliveryPrefs = {
  emailDigest: false,
  emailAlerts: false,
  pushEnabled: false,
  digestCadence: 'off',
};

function readLocal(): DeliveryPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as DeliveryPrefs) };
  } catch {
    return DEFAULTS;
  }
}

function writeLocal(next: DeliveryPrefs) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export default function NotifyPolicyPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [prefs, setPrefs] = useState<DeliveryPrefs>(DEFAULTS);
  const [outbox, setOutbox] = useState<NotifyOutboxItemDto[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

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
    const local = readLocal();
    setPrefs(local);
    fetchNotifyDeliveryPolicy()
      .then((server) => {
        setPrefs(server);
        writeLocal(server);
      })
      .catch(() => undefined);
    listNotifyOutbox()
      .then(setOutbox)
      .catch(() => undefined);
  }, [router]);

  function persist(next: DeliveryPrefs, sync = true) {
    setPrefs(next);
    writeLocal(next);
    if (!sync) return;
    setBusy(true);
    saveNotifyDeliveryPolicy(next)
      .then((saved) => {
        setPrefs(saved);
        writeLocal(saved);
        setNotice('Delivery policy saved on the server (and cached locally).');
        publishEnterpriseEvent('notify.policy_updated', {
          emailAlerts: saved.emailAlerts,
          pushEnabled: saved.pushEnabled,
        });
      })
      .catch(() => {
        setNotice('Saved locally — server sync failed (will retry on next save).');
      })
      .finally(() => setBusy(false));
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    persist(prefs);
  }

  function onTestDeliver() {
    setBusy(true);
    deliverNotification({
      channel: 'email',
      subject: 'EIP test delivery',
      body: 'Simulated outbound notification from Delivery policy. SMTP provider not required for this stub.',
      eventType: 'notify.test',
    })
      .then((item) => {
        setNotice(item.message || `Delivery ${item.status}`);
        return listNotifyOutbox();
      })
      .then(setOutbox)
      .catch(() => setNotice('Test delivery failed.'))
      .finally(() => setBusy(false));
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
            Org email/push preferences synced to the server. Outbound deliveries are simulated into
            an outbox (+ audit) until SMTP/push providers are configured.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app/notifications" className={styles.ghostBtn}>
            Notification Center
          </Link>
          <Link href="/app/audit" className={styles.ghostBtn}>
            Audit
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
              <p>Morning/weekly summary via the notification outbox.</p>
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
              <p>Allow outbound email when Approvals / alerts enqueue deliveries.</p>
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
              <p>Reserved channel — simulated until VAPID keys exist.</p>
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
            <button type="submit" className={adminStyles.primary} disabled={busy}>
              Save delivery prefs
            </button>
            <button
              type="button"
              className={adminStyles.ghost}
              disabled={busy}
              onClick={onTestDeliver}
            >
              Test email delivery
            </button>
          </div>
        </form>
      </section>

      <section className={adminStyles.tableWrap} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Outbox · {outbox.length}</div>
        <p className={styles.lede}>
          Simulated deliveries respect policy channels. Real SMTP/push providers can replace the
          simulator later without changing this UI.
        </p>
        {!outbox.length ? (
          <p className={styles.lede}>No outbox items yet — run a test delivery.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Subject</th>
              </tr>
            </thead>
            <tbody>
              {outbox.slice(0, 12).map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.at).toLocaleString()}</td>
                  <td>{row.channel}</td>
                  <td>{row.status}</td>
                  <td>{row.subject}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
