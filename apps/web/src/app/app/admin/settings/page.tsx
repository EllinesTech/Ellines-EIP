'use client';

/**
 * /app/admin/settings — Business Settings.
 * Org profile, date/time prefs, notification policy.
 * Owner/IT admin only.
 */

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole, isOrgOwnerRole } from '@ellines-eip/shared';
import {
  getSession,
  fetchOrgProfile,
  updateOrgProfile,
  fetchOrgDateTimeSettings,
  updateOrgDateTimeSettings,
  fetchNotifyDeliveryPolicy,
  saveNotifyDeliveryPolicy,
  type OrgProfileDto,
  type OrgDateTimeSettingsDto,
  type NotifyDeliveryPolicyDto,
} from '@/lib/api';
import styles from '../../command.module.css';
import adminStyles from '../admin.module.css';

export default function BusinessSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  const [profile, setProfile] = useState<OrgProfileDto | null>(null);
  const [dtPrefs, setDtPrefs] = useState<OrgDateTimeSettingsDto>({ timeFormat: '12h', dateStyle: 'short' });
  const [notifyPolicy, setNotifyPolicy] = useState<NotifyDeliveryPolicyDto | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace('/login'); return; }
    if (!isOrgAdminRole(session.user.role)) { router.replace('/app'); return; }
    setIsOwner(isOrgOwnerRole(session.user.role));

    Promise.all([
      fetchOrgProfile().catch(() => null as OrgProfileDto | null),
      fetchOrgDateTimeSettings().catch(() => ({ timeFormat: '12h', dateStyle: 'short' }) as OrgDateTimeSettingsDto),
      fetchNotifyDeliveryPolicy().catch(() => null as NotifyDeliveryPolicyDto | null),
    ]).then(([prof, dt, notif]) => {
      if (prof) setProfile(prof);
      setDtPrefs(dt);
      if (notif) setNotifyPolicy(notif);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load settings')).finally(() => setLoading(false));
  }, [router]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile || !isOwner) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await updateOrgProfile({ name: profile.name });
      setNotice('Organisation name saved.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleSaveDT(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await updateOrgDateTimeSettings(dtPrefs);
      setNotice('Date & time preferences saved.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleSaveNotify(e: FormEvent) {
    e.preventDefault();
    if (!notifyPolicy) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await saveNotifyDeliveryPolicy(notifyPolicy);
      setNotice('Notification policy saved.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = {
    background: '#0b0e14', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
    color: '#f4f7fb', padding: '0.32rem 0.5rem', minHeight: 32,
    fontFamily: 'inherit', fontSize: '0.82rem', width: '100%', boxSizing: 'border-box' as const,
  };
  const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column' as const, gap: 4,
    fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#8b95a8',
  };
  const panelStyle: React.CSSProperties = {
    background: '#161b26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem',
  };

  if (loading) return <div className={styles.page} style={{ padding: '2rem' }}><p style={{ color: '#8b95a8' }}>Loading settings…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Administration · Settings</p>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Business Settings</h1>
          <p className={styles.lede}>Organisation profile, date/time preferences, and notification policy.</p>
        </div>
      </header>

      {error && <div role="alert" style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: 8, fontSize: '0.85rem' }}>{error}</div>}
      {notice && <div role="status" style={{ color: '#10b981', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.08)', borderRadius: 8, fontSize: '0.85rem' }}>{notice}</div>}

      {/* Organisation Profile */}
      {profile && (
        <section style={panelStyle}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#f4f7fb' }}>Organisation Profile</h2>
          <form onSubmit={handleSaveProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <label style={labelStyle}>
              Organisation Name
              <input style={inputStyle} value={profile.name ?? ''} onChange={(e) => setProfile((p) => p ? { ...p, name: e.target.value } : p)} disabled={!isOwner} required />
            </label>
            {isOwner && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className={adminStyles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
              </div>
            )}
          </form>
        </section>
      )}

      {/* Date & Time */}
      <section style={panelStyle}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#f4f7fb' }}>Date & Time</h2>
        <form onSubmit={handleSaveDT} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <label style={labelStyle}>
            Time Format
            <select style={inputStyle} value={dtPrefs.timeFormat} onChange={(e) => setDtPrefs((p) => ({ ...p, timeFormat: e.target.value as '12h' | '24h' }))}>
              <option value="12h">12-hour (AM/PM)</option>
              <option value="24h">24-hour</option>
            </select>
          </label>
          <label style={labelStyle}>
            Date Style
            <select style={inputStyle} value={dtPrefs.dateStyle} onChange={(e) => setDtPrefs((p) => ({ ...p, dateStyle: e.target.value as 'short' | 'medium' | 'log' }))}>
              <option value="short">Short (01/01/2026)</option>
              <option value="medium">Medium</option>
              <option value="log">Log format</option>
            </select>
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className={adminStyles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</button>
          </div>
        </form>
      </section>

      {/* Notification policy */}
      {notifyPolicy && (
        <section style={panelStyle}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#f4f7fb' }}>Notification Policy</h2>
          <form onSubmit={handleSaveNotify} style={{ display: 'grid', gap: '0.6rem' }}>
            {Object.entries(notifyPolicy).filter(([k]) => typeof notifyPolicy[k as keyof NotifyDeliveryPolicyDto] === 'boolean').map(([key]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', color: '#f4f7fb' }}>
                <input
                  type="checkbox"
                  checked={Boolean(notifyPolicy[key as keyof NotifyDeliveryPolicyDto])}
                  onChange={(e) => setNotifyPolicy((p) => p ? { ...p, [key]: e.target.checked } : p)}
                />
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
              </label>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="submit" className={adminStyles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save policy'}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
