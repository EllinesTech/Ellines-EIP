/** Org-scoped Work Console policy (Owner/IT). Browser-local until server policy API. */

import { isOrgAdminRole } from '@ellines-eip/shared';

export type OrgUiPolicy = {
  /** When true, non-Owner/IT roles do not see the Ask Ellinea float. */
  hideAskFromWorkUsers: boolean;
  /**
   * When true, executives / managers / members / viewers may open Organization System.
   * Default off — Owner/IT authorize later from System Settings.
   */
  allowWorkRolesOrgSystem: boolean;
};

const DEFAULTS: OrgUiPolicy = {
  hideAskFromWorkUsers: false,
  allowWorkRolesOrgSystem: false,
};

export const ORG_UI_POLICY_EVENT = 'eip-org-ui-policy';

function storageKey(orgId: string): string {
  return `eip_org_ui_policy:${orgId}`;
}

export function readOrgUiPolicy(orgId: string): OrgUiPolicy {
  if (typeof window === 'undefined' || !orgId) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<OrgUiPolicy>;
    return {
      hideAskFromWorkUsers: parsed.hideAskFromWorkUsers === true,
      allowWorkRolesOrgSystem: parsed.allowWorkRolesOrgSystem === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeOrgUiPolicy(orgId: string, policy: OrgUiPolicy): void {
  if (typeof window === 'undefined' || !orgId) return;
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(policy));
    window.dispatchEvent(
      new CustomEvent(ORG_UI_POLICY_EVENT, { detail: { orgId, policy } }),
    );
  } catch {
    /* quota / private mode */
  }
}

/** Owner/IT always; work roles only when Settings toggle is on for this org (this device). */
export function canAccessOrgSystem(
  role: string | undefined | null,
  orgId: string | undefined | null,
): boolean {
  if (isOrgAdminRole(role)) return true;
  if (!orgId) return false;
  return readOrgUiPolicy(orgId).allowWorkRolesOrgSystem === true;
}
