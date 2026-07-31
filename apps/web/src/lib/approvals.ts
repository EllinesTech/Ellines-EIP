import type { EnterpriseSummaryDto } from '@/lib/api';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ApprovalRequest = {
  id: string;
  title: string;
  detail: string;
  requester: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  source: 'manual' | 'decision-seed';
};

const PREFIX = 'eip_approvals_';

export function approvalsKey(organizationId: string) {
  return `${PREFIX}${organizationId}`;
}

export function readApprovals(organizationId: string): ApprovalRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(approvalsKey(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ApprovalRequest[];
    return Array.isArray(parsed) ? parsed.slice(0, 80) : [];
  } catch {
    return [];
  }
}

export function writeApprovals(organizationId: string, items: ApprovalRequest[]) {
  localStorage.setItem(approvalsKey(organizationId), JSON.stringify(items.slice(0, 80)));
}

export function seedApprovalsFromSummary(
  organizationId: string,
  summary: EnterpriseSummaryDto | null,
  existing: ApprovalRequest[],
): ApprovalRequest[] {
  if (!summary || summary.status !== 'synced' || summary.openDecisions <= 0) {
    return existing;
  }
  const seedId = `seed-decisions-${summary.syncedAt || 'latest'}`;
  if (existing.some((a) => a.id === seedId)) return existing;
  const seeded: ApprovalRequest = {
    id: seedId,
    title: `Clear ${summary.openDecisions} open decision${summary.openDecisions === 1 ? '' : 's'}`,
    detail: `${summary.briefHighlight} Source: ${summary.connectorName}.`,
    requester: 'Enterprise snapshot',
    status: 'pending',
    createdAt: summary.syncedAt || new Date().toISOString(),
    source: 'decision-seed',
  };
  return [seeded, ...existing].slice(0, 80);
}

export function canDecideApprovals(role: string | undefined | null): boolean {
  return ['owner', 'admin', 'executive', 'manager'].includes(role || '');
}
