'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getSession,
  inviteOrgUser,
  listOrgUsers,
  OrgMember,
  updateOrgUser,
  cacheOrgDateTimeSettings,
  fetchOrgDateTimeSettings,
  updateOrgDateTimeSettings,
  type OrgDateTimeSettingsDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from './admin.module.css';
import {
  DEFAULT_ORG_DATETIME_SETTINGS,
  formatOrgDateTime,
  isOrgAdminRole,
  isOrgOwnerRole,
  roleLabel,
  rolesAssignableBy,
  type OrgDateTimeSettings,
} from '@ellines-eip/shared';

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [actorRole, setActorRole] = useState('member');
  const [actorId, setActorId] = useState('');
  const [users, setUsers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [orgId, setOrgId] = useState('');
  const [timeFormat, setTimeFormat] = useState<OrgDateTimeSettings['timeFormat']>(
    DEFAULT_ORG_DATETIME_SETTINGS.timeFormat,
  );
  const [dateStyle, setDateStyle] = useState<OrgDateTimeSettings['dateStyle']>(
    DEFAULT_ORG_DATETIME_SETTINGS.dateStyle,
  );
  const [clockPreview, setClockPreview] = useState(() =>
    formatOrgDateTime(new Date(), DEFAULT_ORG_DATETIME_SETTINGS),
  );
  const [systemBusy, setSystemBusy] = useState(false);
  const [systemNotice, setSystemNotice] = useState('');

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
    setActorRole(s.user.role);
    setActorId(s.user.id);
    setOrgId(s.organization.id);
    setAllowed(true);
    fetchOrgDateTimeSettings()
      .then((prefs) => {
        setTimeFormat(prefs.timeFormat);
        setDateStyle(prefs.dateStyle);
        cacheOrgDateTimeSettings(s.organization.id, prefs);
      })
      .catch(() => {
        /* keep defaults */
      });
  }, [router]);

  useEffect(() => {
    setClockPreview(formatOrgDateTime(new Date(), { timeFormat, dateStyle }));
  }, [timeFormat, dateStyle]);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const list = await listOrgUsers();
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!allowed) return;
    void loadUsers();
  }, [allowed]);

  const assignableRoles = rolesAssignableBy(actorRole);
  const isOwner = isOrgOwnerRole(actorRole);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setTempPassword(null);
    try {
      const result = await inviteOrgUser({
        email: inviteEmail,
        fullName: inviteName,
        role: inviteRole,
      });
      setTempPassword(result.temporaryPassword);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('member');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(userId: string, role: string) {
    setBusy(true);
    setError('');
    try {
      await updateOrgUser(userId, { role });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed');
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(user: OrgMember) {
    setBusy(true);
    setError('');
    try {
      await updateOrgUser(user.id, { isActive: !user.isActive });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveSystemDateTime(e: FormEvent) {
    e.preventDefault();
    setSystemBusy(true);
    setError('');
    setSystemNotice('');
    try {
      const saved = await updateOrgDateTimeSettings({ timeFormat, dateStyle });
      setTimeFormat(saved.timeFormat);
      setDateStyle(saved.dateStyle);
      if (orgId) cacheOrgDateTimeSettings(orgId, saved);
      setSystemNotice('System date & time display saved for this organization.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save system settings');
    } finally {
      setSystemBusy(false);
    }
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
          <p className={styles.eyebrow}>
            {isOwner ? 'Organization Owner' : 'IT Admin'}
          </p>
          <h1>{isOwner ? 'People & authority' : 'Users & access'}</h1>
          <p className={styles.lede}>
            {isOwner
              ? 'You own this organization. Invite IT Admins and work users. Only you can grant or revoke IT.'
              : 'You run systems for the Owner. Invite executives, managers, and members — Owner/IT accounts stay with the Owner.'}
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {systemNotice ? <p className={adminStyles.notice}>{systemNotice}</p> : null}
      {tempPassword ? (
        <p className={adminStyles.notice}>
          Invite created. Temporary password: <code>{tempPassword}</code> — share securely; user
          should change it after first login.
        </p>
      ) : null}

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>System — date &amp; time</div>
        <p className={styles.lede}>
          Organization-wide clock and log dates for the whole tenant. Personal photo and name stay
          under Profile.
        </p>
        <form className={adminStyles.form} onSubmit={(e) => void onSaveSystemDateTime(e)}>
          <label>
            Time format
            <select
              value={timeFormat}
              disabled={systemBusy}
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
              disabled={systemBusy}
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
              aria-label="System date and time preview"
            />
          </label>
          <button type="submit" className={adminStyles.primary} disabled={systemBusy}>
            {systemBusy ? 'Saving…' : 'Save system display'}
          </button>
        </form>
      </section>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Invite user</div>
        <form className={adminStyles.form} onSubmit={onInvite}>
          <label>
            Full name
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              required
              minLength={2}
              placeholder="Jane Mwangi"
            />
          </label>
          <label>
            Work email
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="jane@company.com"
            />
          </label>
          <label>
            Role
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            {busy ? 'Working…' : 'Invite'}
          </button>
        </form>
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Members</div>
        {loading ? (
          <p className={styles.lede}>Loading members…</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const locked =
                  !isOwner && (u.role === 'owner' || u.role === 'admin');
                const roleOptions = locked
                  ? [u.role]
                  : assignableRoles.includes(u.role as never)
                    ? assignableRoles
                    : [...assignableRoles, u.role as never];
                return (
                  <tr key={u.id} className={u.isActive ? undefined : adminStyles.inactive}>
                    <td>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        disabled={busy || locked}
                        onChange={(e) => void onRoleChange(u.id, e.target.value)}
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button
                        type="button"
                        className={adminStyles.ghost}
                        disabled={busy || u.id === actorId || locked}
                        onClick={() => void onToggleActive(u)}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
