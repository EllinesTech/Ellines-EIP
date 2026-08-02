'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CustomRole } from './page';
import settingsStyles from '../settings.module.css';
import adminStyles from '../../admin/admin.module.css';
import rolesStyles from './roles.module.css';
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from './permissions';

interface RoleEditorProps {
  role: CustomRole | null;
  onSave: (role: CustomRole) => void;
  onCancel: () => void;
}

export function RoleEditor({ role, onSave, onCancel }: RoleEditorProps) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(role?.permissions || [])
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [colorPreset, setColorPreset] = useState<'violet' | 'blue' | 'teal'>('violet');

  const isEditing = !!role;

  function togglePermission(permission: string) {
    const next = new Set(selectedPermissions);
    if (next.has(permission)) {
      next.delete(permission);
    } else {
      next.add(permission);
    }
    setSelectedPermissions(next);
  }

  function toggleGroup(group: string) {
    const groupPerms = PERMISSION_GROUPS.find((g) => g.id === group)?.permissions || [];
    const allInGroup = groupPerms.every((p) => selectedPermissions.has(p));

    const next = new Set(selectedPermissions);
    if (allInGroup) {
      // Deselect all
      groupPerms.forEach((p) => next.delete(p));
    } else {
      // Select all
      groupPerms.forEach((p) => next.add(p));
    }
    setSelectedPermissions(next);
  }

  function selectAll() {
    setSelectedPermissions(new Set(ALL_PERMISSIONS));
  }

  function selectNone() {
    setSelectedPermissions(new Set());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Role name is required');
      return;
    }
    if (selectedPermissions.size === 0) {
      setError('At least one permission is required');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const url = isEditing
        ? `/api/v1/orgs/me/roles/${role.id}`
        : '/api/v1/orgs/me/roles';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          permissions: Array.from(selectedPermissions),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Failed to save role: ${response.statusText}`
        );
      }

      const saved = await response.json();
      onSave(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role');
    } finally {
      setBusy(false);
    }
  }

  const groupCounters = PERMISSION_GROUPS.map((group) => ({
    ...group,
    selected: group.permissions.filter((p) => selectedPermissions.has(p)).length,
  }));

  return (
    <section className={settingsStyles.card}>
      <div className={settingsStyles.cardHead}>
        <p className={settingsStyles.cardEyebrow}>
          {isEditing ? 'Edit' : 'Create'} role
        </p>
        <h2 className={settingsStyles.cardTitle}>
          {isEditing ? role.name : 'New custom role'}
        </h2>
        <p className={settingsStyles.cardHint}>
          {isEditing
            ? 'Update the role details and select which permissions to grant.'
            : 'Define a new role template with granular permissions. Use the permission matrix to select which features this role can access.'}
        </p>
      </div>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      <form onSubmit={(e) => void onSubmit(e)}>
        <div className={settingsStyles.form}>
          <label>
            Role name *
            <input
              type="text"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Finance Manager"
              required
              maxLength={100}
            />
          </label>
          <label>
            Description (optional)
            <textarea
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What can this role do?"
              maxLength={500}
              rows={3}
            />
          </label>

          <label style={{ marginTop: '1.5rem' }}>
            Role badge color (visual hint)
            <div className={settingsStyles.optionRow} role="group" aria-label="Badge color">
              {(
                [
                  { id: 'violet', label: 'Violet', swatch: '#7c3aed' },
                  { id: 'blue', label: 'Blue', swatch: '#2563EB' },
                  { id: 'teal', label: 'Teal', swatch: '#0d9488' },
                ] as { id: 'violet' | 'blue' | 'teal'; label: string; swatch: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    colorPreset === opt.id
                      ? `${settingsStyles.option} ${settingsStyles.optionActive}`
                      : settingsStyles.option
                  }
                  onClick={() => setColorPreset(opt.id)}
                  disabled={busy}
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
          </label>
        </div>

        <div className={rolesStyles.permissionsSection}>
          <div className={rolesStyles.permissionsHead}>
            <h3>Permissions ({selectedPermissions.size} selected)</h3>
            <div className={rolesStyles.permissionsToolbar}>
              <button
                type="button"
                className={adminStyles.secondary}
                onClick={selectAll}
                disabled={busy}
              >
                Select all
              </button>
              <button
                type="button"
                className={adminStyles.secondary}
                onClick={selectNone}
                disabled={busy}
              >
                Clear all
              </button>
            </div>
          </div>

          <div className={rolesStyles.permissionsMatrix}>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.id} className={rolesStyles.permissionGroup}>
                <div
                  className={rolesStyles.permissionGroupHeader}
                  onClick={() => toggleGroup(group.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleGroup(group.id);
                    }
                  }}
                >
                  <div className={rolesStyles.permissionGroupTitleRow}>
                    <div
                      className={rolesStyles.permissionGroupCheckbox}
                      aria-hidden
                      style={{
                        background:
                          groupCounters
                            .find((g) => g.id === group.id)
                            ?.selected ===
                          group.permissions.length
                            ? '#7c3aed'
                            : groupCounters.find((g) => g.id === group.id)?.selected
                              ? '#2563EB'
                              : '#444',
                      }}
                    />
                    <div>
                      <h4 className={rolesStyles.permissionGroupTitle}>{group.label}</h4>
                      <p className={rolesStyles.permissionGroupHint}>{group.description}</p>
                    </div>
                  </div>
                  <span className={rolesStyles.permissionGroupCounter}>
                    {groupCounters.find((g) => g.id === group.id)?.selected}/{group.permissions.length}
                  </span>
                </div>

                <div className={rolesStyles.permissionGrid}>
                  {group.permissions.map((permission) => (
                    <label
                      key={permission}
                      className={rolesStyles.permissionItem}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissions.has(permission)}
                        onChange={() => togglePermission(permission)}
                        disabled={busy}
                      />
                      <span className={rolesStyles.permissionLabel}>
                        {permission}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={settingsStyles.actions}>
          <button
            type="submit"
            className={adminStyles.primary}
            disabled={busy || selectedPermissions.size === 0}
          >
            {busy
              ? 'Saving…'
              : isEditing
                ? 'Update role'
                : 'Create role'}
          </button>
          <button
            type="button"
            className={adminStyles.secondary}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
