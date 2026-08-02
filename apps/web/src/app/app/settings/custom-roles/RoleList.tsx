'use client';

import { CustomRole } from './page';
import settingsStyles from '../settings.module.css';
import adminStyles from '../../admin/admin.module.css';
import rolesStyles from './roles.module.css';

interface RoleListProps {
  roles: CustomRole[];
  onEdit: (role: CustomRole) => void;
  onDelete: (roleId: string) => void;
  onCreateNew: () => void;
}

export function RoleList({ roles, onEdit, onDelete, onCreateNew }: RoleListProps) {
  return (
    <>
      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>Manage</p>
          <h2 className={settingsStyles.cardTitle}>Custom Roles ({roles.length})</h2>
          <p className={settingsStyles.cardHint}>
            Create role templates with specific permissions. Custom roles complement fixed roles
            (Owner, Admin, Manager, Member, Viewer).
          </p>
        </div>

        <div className={rolesStyles.rolesList}>
          {roles.length === 0 ? (
            <p className={adminStyles.notice} style={{ marginBottom: '1rem' }}>
              No custom roles yet. Create one to get started.
            </p>
          ) : (
            roles.map((role) => (
              <div key={role.id} className={rolesStyles.roleCard}>
                <div className={rolesStyles.roleCardHead}>
                  <div>
                    <h3 className={rolesStyles.roleName}>{role.name}</h3>
                    {role.description && (
                      <p className={rolesStyles.roleDescription}>{role.description}</p>
                    )}
                  </div>
                  <span
                    className={`${rolesStyles.roleStatus} ${
                      role.isActive ? rolesStyles.roleActive : rolesStyles.roleInactive
                    }`}
                  >
                    {role.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className={rolesStyles.rolePermissions}>
                  <p className={rolesStyles.permissionsLabel}>
                    {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                  </p>
                  <div className={rolesStyles.permissionChips}>
                    {role.permissions.slice(0, 5).map((perm) => (
                      <span key={perm} className={rolesStyles.permissionChip}>
                        {perm}
                      </span>
                    ))}
                    {role.permissions.length > 5 && (
                      <span className={rolesStyles.permissionChipMore}>
                        +{role.permissions.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
                <div className={rolesStyles.roleActions}>
                  <button
                    type="button"
                    className={adminStyles.secondary}
                    onClick={() => onEdit(role)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={adminStyles.secondary}
                    onClick={() => onDelete(role.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={settingsStyles.card}>
        <div className={settingsStyles.cardHead}>
          <p className={settingsStyles.cardEyebrow}>Quick start</p>
          <h2 className={settingsStyles.cardTitle}>Create a new role</h2>
          <p className={settingsStyles.cardHint}>
            Define a new role with a custom set of permissions. Choose from 50+ granular permissions
            covering connectors, reports, workflows, settings, and more.
          </p>
        </div>
        <div className={settingsStyles.actions}>
          <button type="button" className={adminStyles.primary} onClick={onCreateNew}>
            Create custom role
          </button>
        </div>
      </section>
    </>
  );
}
