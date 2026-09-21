'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CustomRole } from './page';
import settingsStyles from '../settings.module.css';
import adminStyles from '../../admin/admin.module.css';
import rolesStyles from './roles.module.css';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, normalizePermissionEntry, type RoleTemplate } from './permissions';

interface RoleEditorProps {
  role: CustomRole | null;
  template?: RoleTemplate | null;
  onSave: (role: CustomRole) => void;
  onCancel: () => void;
}

/** Per-permission ABAC scope, keyed by permission id, as raw editable text. */
interface ScopeDraft {
  resources: string; // comma-separated resource IDs
  attributes: string; // comma-separated key=value pairs
}

export function RoleEditor({ role, template, onSave, onCancel }: RoleEditorProps) {
  const [name, setName] = useState(role?.name || template?.name || '');
  const [description, setDescription] = useState(role?.description || template?.description || '');
  const initialEntries = (role?.permissions || template?.permissions || []).map(normalizePermissionEntry);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(initialEntries.map((e) => e.permission))
  );
  const [scoping, setScoping] = useState<Record<string, ScopeDraft>>(() => {
    const out: Record<string, ScopeDraft> = {};
    for (const e of initialEntries) {
      if (e.resources?.length || (e.attributes && Object.keys(e.attributes).length)) {
        out[e.permission] = {
          resources: (e.resources || []).join(', '),
          attributes: Object.entries(e.attributes || {}).map(([k, v]) => `${k}=${v}`).join(', '),
        };
      }
    }
    return out;
  });
  const [showScoping, setShowScoping] = useState(false);
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

  function setScope(permission: string, field: keyof ScopeDraft, value: string) {
    setScoping((prev) => {
      const base = prev[permission] || { resources: '', attributes: '' };
      return { ...prev, [permission]: { ...base, [field]: value } };
    });
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

      // Build ABAC-ready permission entries: plain permission, plus optional
      // resource IDs / attribute conditions from the scoping panel below.
      const permissions = Array.from(selectedPermissions).map((permission) => {
        const scope = scoping[permission];
        const entry: { permission: string; resources?: string[]; attributes?: Record<string, string> } = {
          permission,
        };
        const resources = (scope?.resources || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (resources.length) entry.resources = resources;

        const attributes: Record<string, string> = {};
        for (const pair of (scope?.attributes || '').split(',')) {
          const [k, v] = pair.split('=').map((s) => s.trim());
          if (k && v) attributes[k] = v;
        }
        if (Object.keys(attributes).length) entry.attributes = attributes;

        return entry;
      });

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          permissions,
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

        {selectedPermissions.size > 0 && (
          <div className={rolesStyles.permissionsSection}>
            <div className={rolesStyles.permissionsHead}>
              <h3>Advanced scoping (ABAC)</h3>
              <button
                type="button"
                className={adminStyles.secondary}
                onClick={() => setShowScoping((v) => !v)}
                disabled={busy}
              >
                {showScoping ? 'Hide' : 'Show'}
              </button>
            </div>
            {showScoping && (
              <>
                <p className={rolesStyles.permissionGroupHint} style={{ marginBottom: '0.75rem' }}>
                  Optional. Leave blank to grant a permission org-wide. Scope it to specific resource
                  IDs (e.g. one branch or report) and/or attribute conditions (e.g. department=Finance)
                  — matches <code>PermissionService.evaluate()</code> on the backend.
                </p>
                <div className={rolesStyles.permissionGrid}>
                  {Array.from(selectedPermissions).map((permission) => (
                    <div key={permission} className={rolesStyles.permissionItem} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                      <span className={rolesStyles.permissionLabel} style={{ fontWeight: 600 }}>
                        {permission}
                      </span>
                      <input
                        type="text"
                        placeholder="Resource IDs (comma-separated) — blank = all"
                        value={scoping[permission]?.resources || ''}
                        onChange={(e) => setScope(permission, 'resources', e.target.value)}
                        disabled={busy}
                      />
                      <input
                        type="text"
                        placeholder="Attributes e.g. department=Finance, branch=HQ"
                        value={scoping[permission]?.attributes || ''}
                        onChange={(e) => setScope(permission, 'attributes', e.target.value)}
                        disabled={busy}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

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
