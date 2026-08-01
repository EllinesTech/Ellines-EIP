'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createChildOrg,
  getSession,
  listMyOrgs,
  setSession,
  switchOrg,
  type AuthSession,
  type OrgMembership,
} from '@/lib/api';
import { isOrgOwnerRole } from '@ellines-eip/shared';
import styles from './org-switcher.module.css';

interface Props {
  session: AuthSession;
  onSwitch?: (next: AuthSession) => void;
}

export function OrgSwitcher({ session, onSwitch }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const isOwner = isOrgOwnerRole(session.user.role);

  // Load orgs when dropdown opens (lazy)
  useEffect(() => {
    if (!open || loaded) return;
    listMyOrgs()
      .then((list) => {
        setOrgs(list);
        setLoaded(true);
        // Cache in session
        const current = getSession();
        if (current) setSession({ ...current, orgs: list });
      })
      .catch(() => {
        // Fallback: show only current org
        setOrgs([
          {
            id: session.organization.id,
            name: session.organization.name,
            slug: session.organization.slug,
            role: session.user.role,
            isPrimary: true,
            parentOrgId: null,
          },
        ]);
        setLoaded(true);
      });
  }, [open, loaded, session]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAdd(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  async function handleSwitch(targetId: string) {
    if (targetId === session.organization.id || switching) return;
    setSwitching(true);
    try {
      const next = await switchOrg(targetId);
      // Preserve orgs list in new session
      const withOrgs: AuthSession = { ...next, orgs };
      setSession(withOrgs);
      setOpen(false);
      onSwitch?.(withOrgs);
      router.refresh();
    } catch {
      // ignore — stay on current org
    } finally {
      setSwitching(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || addBusy) return;
    setAddBusy(true);
    setAddError('');
    try {
      const child = await createChildOrg(newName.trim());
      // Reload orgs list
      setLoaded(false);
      setShowAdd(false);
      setNewName('');
      // Automatically switch to the new org
      await handleSwitch(child.id);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setAddBusy(false);
    }
  }

  // Don't render switcher if user somehow has no session
  if (!session) return null;

  const displayName = session.organization.name;

  // If only one org and not an owner — no switcher needed
  const hasMultiple = (session.orgs?.length ?? 0) > 1 || orgs.length > 1;
  if (!open && !isOwner && !hasMultiple) return null;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        title="Switch organization"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox" aria-label="Switch organization">
          <div className={styles.dropLabel}>Your organizations</div>

          {orgs.map((org) => {
            const active = org.id === session.organization.id;
            return (
              <button
                key={org.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.orgRow} ${active ? styles.orgRowActive : ''}`}
                disabled={switching}
                onClick={() => handleSwitch(org.id)}
              >
                {active && <span className={styles.activeDot} aria-hidden />}
                <span className={styles.orgMeta}>
                  <span className={styles.orgName}>{org.name}</span>
                  <span className={styles.orgRole}>{org.role}{org.parentOrgId ? ' · child' : ''}</span>
                </span>
              </button>
            );
          })}

          {isOwner && (
            <>
              <div className={styles.divider} />
              {!showAdd ? (
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => setShowAdd(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  Create linked organization
                </button>
              ) : (
                <form className={styles.addForm} onSubmit={handleCreate}>
                  <input
                    className={styles.addInput}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Organization name"
                    required
                    minLength={2}
                    autoFocus
                  />
                  {addError && <p className={styles.addError}>{addError}</p>}
                  <div className={styles.addRow}>
                    <button type="submit" className={styles.addSubmit} disabled={addBusy || !newName.trim()}>
                      {addBusy ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      type="button"
                      className={styles.addCancel}
                      onClick={() => { setShowAdd(false); setNewName(''); setAddError(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
