/**
 * Track D.5: 50+ Granular Permissions
 *
 * Used by custom role builder UI for permission matrix visualization.
 * Matches NestJS permission evaluator engine and Pages Functions permission checks.
 */

export interface PermissionGroup {
  id: string;
  label: string;
  description: string;
  permissions: string[];
}

/**
 * All 50+ permissions organized by feature area
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'auth',
    label: 'Authentication & Organization',
    description: 'User registration, invitations, organization management',
    permissions: [
      'auth.register_org',
      'auth.invite_user',
      'auth.change_password',
      'auth.manage_sso_providers',
    ],
  },
  {
    id: 'org_admin',
    label: 'Organization Administration',
    description: 'Core org settings, member management, structure (branches/departments)',
    permissions: [
      'org.view',
      'org.edit_name',
      'org.edit_settings',
      'org.manage_members',
      'org.create_child_org',
      'org.manage_branches',
      'org.manage_departments',
      'org.view_audit_logs',
    ],
  },
  {
    id: 'connectors',
    label: 'System Connectors',
    description: 'Install, configure, test, and sync enterprise systems',
    permissions: [
      'connector.install',
      'connector.test',
      'connector.sync',
      'connector.delete',
      'connector.configure_auth',
      'connector.autoscan',
      'connector.view_history',
      'connector.manage_webhook',
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    description: 'Create, edit, and manage scheduled reports',
    permissions: [
      'report.create',
      'report.edit',
      'report.delete',
      'report.schedule',
      'report.export',
      'report.share',
      'report.run_now',
      'report.view_all',
    ],
  },
  {
    id: 'workflows',
    label: 'Workflows & Automation',
    description: 'Create rules, approvals, and automated workflows',
    permissions: [
      'workflow.create',
      'workflow.edit',
      'workflow.delete',
      'workflow.execute',
      'workflow.view_history',
      'workflow.manage_templates',
    ],
  },
  {
    id: 'approvals',
    label: 'Approvals',
    description: 'View, decide, and create approval workflows',
    permissions: [
      'approval.view',
      'approval.decide',
      'approval.create_template',
      'approval.edit_template',
      'approval.delete_template',
      'approval.view_history',
    ],
  },
  {
    id: 'dashboards',
    label: 'Dashboards & KPIs',
    description: 'Create and manage custom dashboards and KPI widgets',
    permissions: [
      'dashboard.create',
      'dashboard.edit',
      'dashboard.delete',
      'dashboard.export',
      'dashboard.share',
      'dashboard.view_all',
    ],
  },
  {
    id: 'org_system',
    label: 'Organization System & UEM',
    description: 'Access to capability catalog and unified enterprise model',
    permissions: [
      'org_system.view',
      'org_system.view_people',
      'org_system.view_fleet',
      'org_system.view_documents',
      'org_system.view_alerts',
      'org_system.view_finance',
      'org_system.view_branches',
      'org_system.view_tasks',
    ],
  },
  {
    id: 'ellinea',
    label: 'Ellinea AI & Intelligence',
    description: 'Access to AI recommendations, memory, and enterprise DNA',
    permissions: [
      'ellinea.ask',
      'ellinea.brief',
      'ellinea.recommend',
      'ellinea.memory_read',
      'ellinea.memory_write',
      'ellinea.dna_read',
      'ellinea.dna_write',
      'ellinea.feedback',
    ],
  },
  {
    id: 'settings',
    label: 'Settings & Configuration',
    description: 'System settings, webhooks, API keys, and security',
    permissions: [
      'settings.view_audit',
      'settings.manage_webhooks',
      'settings.manage_api_keys',
      'settings.manage_sso',
      'settings.manage_notification_policy',
      'settings.manage_ui_policy',
      'settings.view_org_settings',
    ],
  },
  {
    id: 'events',
    label: 'Events & Notifications',
    description: 'Create, view, and manage enterprise events',
    permissions: [
      'events.create',
      'events.view',
      'events.delete',
      'events.manage_subscriptions',
      'notifications.view',
      'notifications.delete',
    ],
  },
  {
    id: 'platform',
    label: 'Platform Administration',
    description: 'Super-admin controls for organization suspension and rights',
    permissions: [
      'platform.suspend_org',
      'platform.resume_org',
      'platform.view_all_orgs',
      'platform.manage_platform_settings',
    ],
  },
];

/**
 * Flat list of all permissions for quick lookup and validation
 */
export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.reduce(
  (acc, group) => [...acc, ...group.permissions],
  [] as string[]
);

/**
 * Default permission sets for each fixed role (used by backend PermissionService)
 * These are the baseline permissions before custom role enhancement
 */
export const FIXED_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ALL_PERMISSIONS, // Full access
  admin: ALL_PERMISSIONS.filter((p) => !['platform.suspend_org', 'platform.resume_org', 'platform.view_all_orgs', 'platform.manage_platform_settings'].includes(p)), // All except platform admin
  manager: [
    // Team lead: reports, approvals, some admin
    'org.view',
    'org.manage_members', // Can manage team members
    'report.create',
    'report.edit',
    'report.delete',
    'report.schedule',
    'report.export',
    'report.view_all',
    'approval.view',
    'approval.decide',
    'approval.create_template',
    'org_system.view',
    'org_system.view_people',
    'org_system.view_fleet',
    'ellinea.ask',
    'ellinea.brief',
    'ellinea.recommend',
    'events.view',
    'notifications.view',
  ],
  member: [
    // Standard user: create/use reports
    'org.view',
    'report.create',
    'report.edit',
    'report.export',
    'report.run_now',
    'approval.view',
    'org_system.view',
    'org_system.view_people',
    'org_system.view_fleet',
    'ellinea.ask',
    'ellinea.brief',
    'ellinea.recommend',
    'events.view',
    'notifications.view',
  ],
  viewer: [
    // Read-only
    'org.view',
    'report.view_all',
    'approval.view',
    'org_system.view',
    'org_system.view_people',
    'org_system.view_fleet',
    'ellinea.ask',
    'ellinea.brief',
    'events.view',
    'notifications.view',
  ],
};

/**
 * Common role templates (suggested starting points for creation)
 */
export const ROLE_TEMPLATES = [
  {
    name: 'Finance Manager',
    description: 'Manages financial reports and approvals with visibility into dashboards',
    permissions: [
      'report.create',
      'report.edit',
      'report.schedule',
      'report.export',
      'report.view_all',
      'approval.view',
      'approval.decide',
      'dashboard.view_all',
      'org_system.view_finance',
      'ellinea.ask',
      'ellinea.recommend',
    ],
  },
  {
    name: 'IT Operator',
    description: 'Manages system integrations, connectors, and infrastructure',
    permissions: [
      'connector.install',
      'connector.test',
      'connector.sync',
      'connector.configure_auth',
      'connector.autoscan',
      'connector.view_history',
      'org.manage_branches',
      'org.manage_departments',
      'org_system.view',
      'settings.manage_webhooks',
      'settings.manage_api_keys',
      'ellinea.ask',
      'events.view',
    ],
  },
  {
    name: 'Analyst',
    description: 'Can create and analyze reports but cannot modify organizational structure',
    permissions: [
      'report.create',
      'report.edit',
      'report.export',
      'report.run_now',
      'report.view_all',
      'dashboard.create',
      'dashboard.view_all',
      'org_system.view',
      'org_system.view_people',
      'org_system.view_fleet',
      'ellinea.ask',
      'ellinea.recommend',
    ],
  },
  {
    name: 'Approval Officer',
    description: 'Specialized role for reviewing and approving workflows and requests',
    permissions: [
      'approval.view',
      'approval.decide',
      'approval.view_history',
      'workflow.view_history',
      'org.view',
      'org_system.view',
      'ellinea.ask',
      'events.view',
    ],
  },
  {
    name: 'Department Manager',
    description: 'Manages department structure and team members with report access',
    permissions: [
      'org.view',
      'org.manage_members',
      'org.manage_departments',
      'report.create',
      'report.view_all',
      'approval.view',
      'approval.decide',
      'org_system.view',
      'org_system.view_people',
      'ellinea.ask',
      'events.view',
    ],
  },
];
