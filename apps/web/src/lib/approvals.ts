import type { EnterpriseSummaryDto } from '@/lib/api';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ApprovalStepKey = 'submit' | 'it_review' | 'owner_decide' | 'exec_review' | 'manager_review';

export type ApprovalStep = {
  key: ApprovalStepKey;
  label: string;
  status: ApprovalStatus;
  actorRole?: string;
  decidedBy?: string;
  decidedAt?: string;
};

export type ApprovalTemplateId = 'simple' | 'it_then_owner' | 'manager_exec_owner';

export type ApprovalRequest = {
  id: string;
  title: string;
  detail: string;
  requester: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  source: 'manual' | 'decision-seed' | 'template';
  templateId: ApprovalTemplateId;
  steps: ApprovalStep[];
  currentStepIndex: number;
};

export const APPROVAL_TEMPLATES: {
  id: ApprovalTemplateId;
  label: string;
  description: string;
  steps: { key: ApprovalStepKey; label: string; actorRole: string }[];
}[] = [
  {
    id: 'simple',
    label: 'Single decide',
    description: 'Any Owner / IT / exec / manager can approve or reject.',
    steps: [{ key: 'owner_decide', label: 'Decide', actorRole: 'decider' }],
  },
  {
    id: 'it_then_owner',
    label: 'IT → Owner',
    description: 'IT Admin reviews first, then Organization Owner decides.',
    steps: [
      { key: 'it_review', label: 'IT review', actorRole: 'admin' },
      { key: 'owner_decide', label: 'Owner decide', actorRole: 'owner' },
    ],
  },
  {
    id: 'manager_exec_owner',
    label: 'Manager → Exec → Owner',
    description: 'Three-step path for material decisions.',
    steps: [
      { key: 'manager_review', label: 'Manager review', actorRole: 'manager' },
      { key: 'exec_review', label: 'Executive review', actorRole: 'executive' },
      { key: 'owner_decide', label: 'Owner decide', actorRole: 'owner' },
    ],
  },
];

const PREFIX = 'eip_approvals_';

export function approvalsKey(organizationId: string) {
  return `${PREFIX}${organizationId}`;
}

function normalizeRequest(raw: ApprovalRequest): ApprovalRequest {
  if (raw.steps?.length && typeof raw.currentStepIndex === 'number') {
    return raw;
  }
  const steps: ApprovalStep[] = [
    {
      key: 'owner_decide',
      label: 'Decide',
      status: raw.status === 'pending' ? 'pending' : raw.status,
      actorRole: 'decider',
      decidedBy: raw.decidedBy,
      decidedAt: raw.decidedAt,
    },
  ];
  return {
    ...raw,
    templateId: raw.templateId || 'simple',
    steps,
    currentStepIndex: raw.status === 'pending' ? 0 : 0,
  };
}

export function readApprovals(organizationId: string): ApprovalRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(approvalsKey(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ApprovalRequest[];
    return Array.isArray(parsed) ? parsed.map(normalizeRequest).slice(0, 80) : [];
  } catch {
    return [];
  }
}

export function writeApprovals(organizationId: string, items: ApprovalRequest[]) {
  localStorage.setItem(approvalsKey(organizationId), JSON.stringify(items.slice(0, 80)));
}

export function buildStepsFromTemplate(templateId: ApprovalTemplateId): ApprovalStep[] {
  const tpl = APPROVAL_TEMPLATES.find((t) => t.id === templateId) || APPROVAL_TEMPLATES[0];
  return tpl.steps.map((s) => ({
    key: s.key,
    label: s.label,
    status: 'pending' as const,
    actorRole: s.actorRole,
  }));
}

export function createApprovalRequest(input: {
  title: string;
  detail: string;
  requester: string;
  templateId: ApprovalTemplateId;
  source?: ApprovalRequest['source'];
}): ApprovalRequest {
  const steps = buildStepsFromTemplate(input.templateId);
  return {
    id: `appr_${Date.now()}`,
    title: input.title,
    detail: input.detail,
    requester: input.requester,
    status: 'pending',
    createdAt: new Date().toISOString(),
    source: input.source || 'template',
    templateId: input.templateId,
    steps,
    currentStepIndex: 0,
  };
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
  const steps = buildStepsFromTemplate('it_then_owner');
  const seeded: ApprovalRequest = {
    id: seedId,
    title: `Clear ${summary.openDecisions} open decision${summary.openDecisions === 1 ? '' : 's'}`,
    detail: `${summary.briefHighlight} Source: ${summary.connectorName}.`,
    requester: 'Enterprise snapshot',
    status: 'pending',
    createdAt: summary.syncedAt || new Date().toISOString(),
    source: 'decision-seed',
    templateId: 'it_then_owner',
    steps,
    currentStepIndex: 0,
  };
  return [seeded, ...existing].slice(0, 80);
}

export function canDecideApprovals(role: string | undefined | null): boolean {
  return ['owner', 'admin', 'executive', 'manager'].includes(role || '');
}

function roleCanActOnStep(role: string, step: ApprovalStep): boolean {
  if (step.actorRole === 'decider') return canDecideApprovals(role);
  if (step.actorRole === 'admin') return role === 'admin' || role === 'owner';
  if (step.actorRole === 'owner') return role === 'owner';
  if (step.actorRole === 'executive') {
    return role === 'executive' || role === 'owner';
  }
  if (step.actorRole === 'manager') {
    return role === 'manager' || role === 'executive' || role === 'owner';
  }
  return false;
}

export function canActOnCurrentStep(
  item: ApprovalRequest,
  role: string | undefined | null,
): boolean {
  if (item.status !== 'pending') return false;
  const step = item.steps[item.currentStepIndex];
  if (!step || step.status !== 'pending') return false;
  return roleCanActOnStep(role || '', step);
}

export function advanceApproval(
  item: ApprovalRequest,
  decision: 'approved' | 'rejected',
  actorName: string,
  role: string,
): ApprovalRequest {
  if (item.status !== 'pending') return item;
  const steps = item.steps.map((s) => ({ ...s }));
  const idx = item.currentStepIndex;
  const step = steps[idx];
  if (!step || !roleCanActOnStep(role, step)) return item;

  const now = new Date().toISOString();
  steps[idx] = {
    ...step,
    status: decision,
    decidedBy: actorName || role,
    decidedAt: now,
  };

  if (decision === 'rejected') {
    return {
      ...item,
      steps,
      status: 'rejected',
      decidedAt: now,
      decidedBy: actorName || role,
    };
  }

  const nextIdx = idx + 1;
  if (nextIdx >= steps.length) {
    return {
      ...item,
      steps,
      currentStepIndex: idx,
      status: 'approved',
      decidedAt: now,
      decidedBy: actorName || role,
    };
  }

  return {
    ...item,
    steps,
    currentStepIndex: nextIdx,
    status: 'pending',
  };
}

export function templateLabel(id: ApprovalTemplateId): string {
  return APPROVAL_TEMPLATES.find((t) => t.id === id)?.label || id;
}
