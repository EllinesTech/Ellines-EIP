'use client';

import Link from 'next/link';
import { isOrgAdminRole, isOrgOwnerRole } from '@ellines-eip/shared';
import { getSession } from '@/lib/api';
import { useEffect, useState } from 'react';
import styles from '../../command.module.css';
import adminStyles from '../../admin/admin.module.css';
import settingsStyles from '../settings.module.css';
import rolesStyles from './roles.module.css';
import { RoleList } from './RoleList';
import { RoleEditor } from './RoleEditor';

export interface CustomRole {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

type ViewMode = 'list' | 'create' | 'edit';

export default function CustomRolesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRole, setSelectedRole] = useState<CustomRole | null>(null);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [orgAdmin, setOrgAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setOrgAdmin(isOrgAdminRole(session.user.role));
    setIsOwner(isOrgOwnerRole(session.user.role));
    setOrgId(session.organization.id);
    loadRoles();
  }, []);

  async function loadRoles() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/orgs/me/roles', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to load roles: ${response.statusText}`);
      }
      const data = await response.json();
      setRoles(Array.isArray(data) ? data : data.roles || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateNew() {
    setSelectedRole(null);
    setViewMode('create');
  }

  function handleEdit(role: CustomRole) {
    setSelectedRole(role);
    setViewMode('edit');
  }

  async function handleDelete(roleId: string) {
    if (!confirm('Delete this custom role? This action cannot be undone.')) return;
    setError('');
    try {
      const response = await fetch(`/api/v1/orgs/me/roles/${roleId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Failed to delete role: ${response.statusText}`);
      }
      await loadRoles();
      setNotice('Role deleted successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
    }
  }

  function handleSaveRole(saved: CustomRole) {
    loadRoles().then(() => {
      setViewMode('list');
      setSelectedRole(null);
      setNotice('Role saved successfully');
    });
  }

  function handleCancel() {
    setViewMode('list');
    setSelectedRole(null);
  }

  if (!orgAdmin && !isOwner) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Access Denied</p>
            <h1>Custom Roles</h1>
          </div>
        </header>
        <p className={adminStyles.error}>
          Only Owner or IT Admin can manage custom roles.
        </p>
        <div className={settingsStyles.linkRow} style={{ marginTop: '1rem' }}>
          <Link href="/app/settings" className={styles.primaryLink}>
            Back to Settings →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Organization</p>
          <h1>Custom Roles</h1>
          <p className={styles.lede}>
            Create role templates with granular permissions. Assign to team members to grant specific
            access to features and data.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      {viewMode === 'list' && (
        <>
          {loading ? (
            <div className={settingsStyles.card}>
              <p className={adminStyles.notice}>Loading roles…</p>
            </div>
          ) : (
            <RoleList
              roles={roles}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreateNew={handleCreateNew}
            />
          )}
        </>
      )}

      {viewMode === 'create' && (
        <RoleEditor role={null} onSave={handleSaveRole} onCancel={handleCancel} />
      )}

      {viewMode === 'edit' && selectedRole && (
        <RoleEditor role={selectedRole} onSave={handleSaveRole} onCancel={handleCancel} />
      )}
    </div>
  );
}
