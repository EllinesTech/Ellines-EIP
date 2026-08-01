/** Org-scoped Work Console policy (Owner/IT). Browser-local until server policy API. */

export type OrgUiPolicy = {
  /** When true, non-Owner/IT roles do not see the Ask Ellinea float. */
  hideAskFromWorkUsers: boolean;
};

const DEFAULTS: OrgUiPolicy = {
  hideAskFromWorkUsers: false,
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
