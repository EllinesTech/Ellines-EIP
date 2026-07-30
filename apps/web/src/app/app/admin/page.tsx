'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EIP_ROLES, isOrgAdminRole } from '@ellines-eip/shared';
import {
  getSession,
  inviteOrgUser,
  listOrgUsers,
  OrgMember,
  updateOrgUser,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from './admin.module.css';

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
    setAllowed(true);
  }, [router]);

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

  const assignableRoles = EIP_ROLES.filter((r) => {
    if (r === 'owner') return actorRole === 'owner';
    return true;
  });

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
          <p className={styles.eyebrow}>Org IT Admin</p>
          <h1>Users &amp; rights</h1>
          <p className={styles.lede}>
            Invite members and assign roles for this organization. Platform Super Admin is separate.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {tempPassword ? (
        <p className={adminStyles.notice}>
          Invite created. Temporary password: <code>{tempPassword}</code> — share securely; user
          should change it after first login.
        </p>
      ) : null}

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
                  {r}
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
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? undefined : adminStyles.inactive}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={busy || (u.role === 'owner' && actorRole !== 'owner')}
                      onChange={(e) => void onRoleChange(u.id, e.target.value)}
                    >
                      {assignableRoles
                        .concat(u.role === 'owner' && actorRole !== 'owner' ? (['owner'] as const) : [])
                        .filter((r, i, arr) => arr.indexOf(r) === i)
                        .map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy || u.id === actorId}
                      onClick={() => void onToggleActive(u)}
                    >
                      {u.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
