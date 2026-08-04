'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createOrgBranch,
  createOrgDepartment,
  getSession,
  inviteOrgUser,
  listOrgBranches,
  listOrgDepartments,
  listOrgUsers,
  listPendingInvites,
  sendInvite,
  resendInvite,
  revokeInvite,
  OrgBranch,
  OrgDepartment,
  OrgMember,
  PendingInviteDto,
  updateOrgUser,
  deleteOrgUser,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from './admin.module.css';
import {
  isOrgAdminRole,
  isOrgOwnerRole,
  roleLabel,
  rolesAssignableBy,
} from '@ellines-eip/shared';

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [actorRole, setActorRole] = useState('member');
  const [actorId, setActorId] = useState('');
  const [users, setUsers] = useState<OrgMember[]>([]);
  const [branches, setBranches] = useState<OrgBranch[]>([]);
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteResult, setInviteResult] = useState<{ emailSent: boolean; acceptLink?: string; note?: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptBranchId, setDeptBranchId] = useState('');
  const [childOrgName, setChildOrgName] = useState('');
  const [childOrgNotice, setChildOrgNotice] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);

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

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [u, b, d, pi] = await Promise.all([
        listOrgUsers(),
        listOrgBranches(),
        listOrgDepartments(),
        listPendingInvites().catch(() => [] as PendingInviteDto[]),
      ]);
      setUsers(u);
      setBranches(b);
      setDepartments(d);
      setPendingInvites(pi);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!allowed) return;
    void loadAll();
  }, [allowed]);

  const assignableRoles = rolesAssignableBy(actorRole);
  const isOwner = isOrgOwnerRole(actorRole);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInviteResult(null);
    try {
      const result = await sendInvite({
        email: inviteEmail,
        fullName: inviteName,
        role: inviteRole,
      });
      setInviteResult({
        emailSent: result.emailSent,
        acceptLink: result.acceptLink,
        note: result._note,
      });
      setInviteEmail('');
      setInviteName('');
      setInviteRole('member');
      await loadAll();
    } catch (err) {
      // Fall back to legacy temp-password invite if new endpoint not available
      try {
        const legacy = await inviteOrgUser({ email: inviteEmail, fullName: inviteName, role: inviteRole });
        setInviteResult({ emailSent: false, note: `Temporary password: ${legacy.temporaryPassword} — share securely.` });
        setInviteEmail(''); setInviteName(''); setInviteRole('member');
        await loadAll();
      } catch {
        setError(err instanceof Error ? err.message : 'Invite failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreateBranch(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createOrgBranch({
        name: branchName,
        code: branchCode.trim() || undefined,
      });
      setBranchName('');
      setBranchCode('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateDepartment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createOrgDepartment({
        name: deptName,
        branchId: deptBranchId || undefined,
      });
      setDeptName('');
      setDeptBranchId('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(userId: string, role: string) {
    setBusy(true);
    setError('');
    try {
      await updateOrgUser(userId, { role });
      await loadAll();
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
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteUser(user: OrgMember) {
    if (!confirm(`Permanently delete ${user.fullName} (${user.email})? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteOrgUser(user.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
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
          <p className={styles.eyebrow}>
            {isOwner ? 'Organization Owner' : 'IT Admin'}
          </p>
          <h1>{isOwner ? 'People & authority' : 'Users & access'}</h1>
          <p className={styles.lede}>
            {isOwner
              ? 'Invite IT Admins and work users. Manage branches and departments. Only you can grant or revoke IT.'
              : 'Invite executives, managers, and members. Maintain org structure. Owner/IT stays with the Owner.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/app" className={styles.ghostBtn}>
            Overview
          </Link>
          <Link href="/app/connectors" className={styles.ghostBtn}>
            Connectors
          </Link>
          <Link href="/app/approvals" className={styles.ghostBtn}>
            Approvals
          </Link>
          <Link href="/app/audit" className={styles.ghostBtn}>
            Audit
          </Link>
          <Link href="/app/settings" className={styles.ghostBtn}>
            System Settings
          </Link>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {inviteResult ? (
        <div className={adminStyles.notice}>
          {inviteResult.emailSent
            ? '✉️ Invite email sent with magic link. The user will click to set their password and activate their account.'
            : null}
          {inviteResult.acceptLink ? (
            <span> No email provider configured. Share this link: <code style={{ wordBreak: 'break-all' }}>{inviteResult.acceptLink}</code></span>
          ) : null}
          {inviteResult.note && !inviteResult.emailSent ? <span> {inviteResult.note}</span> : null}
        </div>
      ) : null}

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Invite user — magic link</div>
        <form className={adminStyles.form} onSubmit={(e) => void onInvite(e)}>
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
            {busy ? 'Working…' : 'Send invite'}
          </button>
        </form>
        <p className={styles.lede} style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          An invitation email with a magic link is sent to the user (requires email secrets on Pages).
          The user clicks the link to set their own password and activate their account.
          Without email secrets, a one-time link is returned for manual sharing.
        </p>
      </section>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
          <div className={styles.panelLabel}>Pending invites · {pendingInvites.length}</div>
          <table className={adminStyles.table}>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Invited by</th><th>Expires</th><th /></tr>
            </thead>
            <tbody>
              {pendingInvites.map((inv) => (
                <tr key={inv.email}>
                  <td>{inv.fullName}</td>
                  <td>{inv.email}</td>
                  <td>{roleLabel(inv.role)}</td>
                  <td style={{ fontSize: '0.75rem' }}>{inv.invitedBy}</td>
                  <td style={{ fontSize: '0.75rem' }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" className={adminStyles.ghost} disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try { await resendInvite({ email: inv.email, fullName: inv.fullName, role: inv.role }); await loadAll(); }
                        catch (e) { setError(e instanceof Error ? e.message : 'Resend failed'); }
                        finally { setBusy(false); }
                      }}>Resend</button>
                    <button type="button" className={adminStyles.ghost} disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try { await revokeInvite(inv.email); await loadAll(); }
                        catch (e) { setError(e instanceof Error ? e.message : 'Revoke failed'); }
                        finally { setBusy(false); }
                      }}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Org structure · Branches</div>
        <form className={adminStyles.form} onSubmit={(e) => void onCreateBranch(e)}>
          <label>
            Branch name
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              required
              minLength={2}
              placeholder="Nairobi HQ"
            />
          </label>
          <label>
            Code
            <input
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
              placeholder="NBO"
            />
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            Add branch
          </button>
        </form>
        {branches.length ? (
          <ul className={adminStyles.structList}>
            {branches.map((b) => (
              <li key={b.id}>
                <strong>{b.name}</strong>
                <span>{b.code || '—'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.lede} style={{ marginTop: '0.5rem' }}>
            No branches yet — add sites so Ellinea and connectors can ground by location.
          </p>
        )}
      </section>

      <section className={styles.brief} style={{ marginTop: '0.65rem' }}>
        <div className={styles.panelLabel}>Org structure · Departments</div>
        <form className={adminStyles.form} onSubmit={(e) => void onCreateDepartment(e)}>
          <label>
            Department
            <input
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              required
              minLength={2}
              placeholder="Operations"
            />
          </label>
          <label>
            Branch (optional)
            <select value={deptBranchId} onChange={(e) => setDeptBranchId(e.target.value)}>
              <option value="">Org-wide</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={adminStyles.primary} disabled={busy}>
            Add department
          </button>
        </form>
        {departments.length ? (
          <ul className={adminStyles.structList}>
            {departments.map((d) => {
              const branch = branches.find((b) => b.id === d.branchId);
              return (
                <li key={d.id}>
                  <strong>{d.name}</strong>
                  <span>{branch ? branch.name : 'Org-wide'}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.lede} style={{ marginTop: '0.5rem' }}>
            No departments yet.
          </p>
        )}
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Members</div>
        {loading ? (
          <p className={styles.lede}>Loading members…</p>
        ) : users.length === 0 ? (
          <div className={styles.emptyCallout} style={{ marginTop: '0.5rem' }}>
            <div>
              <strong>No members yet</strong>
              <p>Invite an IT Admin or work user above so the org is not just you.</p>
            </div>
          </div>
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
                const self = u.id === actorId;
                const canEditRole =
                  !self &&
                  assignableRoles.includes(u.role as (typeof assignableRoles)[number]);
                return (
                  <tr key={u.id} className={u.isActive ? undefined : adminStyles.inactive}>
                    <td>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>
                      {canEditRole ? (
                        <select
                          value={u.role}
                          disabled={busy}
                          onChange={(e) => void onRoleChange(u.id, e.target.value)}
                        >
                          {assignableRoles.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                          {!assignableRoles.includes(u.role as (typeof assignableRoles)[number]) ? (
                            <option value={u.role}>{roleLabel(u.role)}</option>
                          ) : null}
                        </select>
                      ) : (
                        roleLabel(u.role)
                      )}
                    </td>
                    <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      {!self ? (
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className={adminStyles.ghost}
                            disabled={busy}
                            onClick={() => void onToggleActive(u)}
                          >
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                          <button
                            type="button"
                            className={adminStyles.ghost}
                            disabled={busy}
                            style={{ color: '#fca5a5' }}
                            onClick={() => void onDeleteUser(u)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        'You'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* v1.1 — Multi-company: Owner can create a linked child org */}
      {isOwner && (
        <section className={styles.brief} style={{ marginTop: '0.85rem' }}>
          <div className={styles.panelLabel}>Linked organizations (v1.1)</div>
          <p className={styles.lede}>
            Create a child organization inside this group. You become its Owner and can switch to it
            from the org switcher in the top bar.
          </p>
          <form
            className={adminStyles.form}
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              try {
                const { createChildOrg } = await import('@/lib/api');
                await createChildOrg(childOrgName.trim());
                setChildOrgName('');
                setChildOrgNotice(`Linked org "${childOrgName.trim()}" created. Use the org switcher in the top bar to switch into it.`);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create linked org');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Organization name
              <input
                value={childOrgName}
                onChange={(e) => setChildOrgName(e.target.value)}
                placeholder="Nairobi Branch Co."
                required
                minLength={2}
              />
            </label>
            <button type="submit" className={adminStyles.primary} disabled={busy || !childOrgName.trim()}>
              {busy ? 'Creating…' : 'Create linked org'}
            </button>
          </form>
          {childOrgNotice ? <p className={adminStyles.notice}>{childOrgNotice}</p> : null}
        </section>
      )}

      {/* ── Bulk CSV invite (S7.6) ───────────────────────────────────────── */}
      <section className={styles.brief} style={{ marginTop: '0.85rem' }}>
        <div className={styles.panelLabel}>Bulk invite — CSV</div>
        <p className={styles.lede}>
          Paste a CSV with columns: <code>email, fullName, role</code> (role optional, defaults to member).
          One row per line. Each person receives a magic-link invite email.
        </p>
        <form className={adminStyles.form} onSubmit={async (e) => {
          e.preventDefault();
          if (!csvText.trim() || csvBusy) return;
          setCsvBusy(true); setCsvResult(null); setError('');
          const lines = csvText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
          const results: string[] = [];
          let ok = 0; let fail = 0;
          for (const line of lines.slice(0, 50)) {
            const [emailRaw, fullNameRaw, roleRaw] = line.split(',').map((s) => s.trim());
            const invEmail = emailRaw?.toLowerCase();
            const invName = fullNameRaw || invEmail;
            const invRole = assignableRoles.includes((roleRaw || 'member') as (typeof assignableRoles)[number]) ? (roleRaw || 'member') : 'member';
            if (!invEmail || !invEmail.includes('@')) { results.push(`✗ Skipped: "${line}" (invalid email)`); fail++; continue; }
            try {
              const r = await sendInvite({ email: invEmail, fullName: invName, role: invRole });
              results.push(`✓ ${invEmail} — ${r.emailSent ? 'email sent' : 'link generated'}`);
              ok++;
            } catch (err) {
              results.push(`✗ ${invEmail} — ${err instanceof Error ? err.message : 'failed'}`);
              fail++;
            }
          }
          setCsvResult(`Done: ${ok} invited, ${fail} failed.\n\n${results.join('\n')}`);
          setCsvText('');
          setCsvBusy(false);
          await loadAll();
        }}>
          <label style={{ gridColumn: '1 / -1' }}>
            CSV rows
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={5}
              placeholder={`jane@company.com, Jane Mwangi, executive\njohn@company.com, John Doe, member`}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.5rem 0.7rem', fontSize: '0.85rem', resize: 'vertical' }}
            />
          </label>
          <button type="submit" className={adminStyles.primary} disabled={csvBusy || !csvText.trim()}>
            {csvBusy ? 'Sending invites…' : 'Send bulk invites'}
          </button>
        </form>
        {csvResult ? (
          <pre style={{ marginTop: '0.65rem', background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '0.65rem', fontSize: '0.75rem', whiteSpace: 'pre-wrap', color: '#c5cddb', maxHeight: 200, overflowY: 'auto' }}>
            {csvResult}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
