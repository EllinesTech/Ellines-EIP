/**
 * Pages Function: POST /api/v1/orgs/me/approvals/:id/decide
 * Approve or reject the current step of an approval request.
 * Sends email notification to requester when decision is final.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../../../shared/auth';
import { sendOutboundEmail, resolveMailConfig } from '../../../../../../shared/mail';

type ApprovalStep = {
  key: string; label: string; status: string; actorRole: string;
  decidedBy?: string | null; decidedAt?: string | null;
};

type ApprovalRecord = {
  id: string; title: string; detail: string; requester: string;
  status: string; templateId: string; currentStepIndex: number;
  source: string; decidedAt?: string | null; decidedBy?: string | null;
  createdAt: string; steps: ApprovalStep[];
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalize(raw: unknown): ApprovalRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ApprovalRecord[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  ).slice(0, 80);
}

function roleCanActOnStep(role: string, actorRole: string): boolean {
  // actorRole is the role required to act on this step
  // role is the user's actual role
  if (actorRole === 'decider') return ['owner', 'admin', 'executive'].includes(role);
  if (actorRole === 'admin') return role === 'admin' || role === 'owner';
  if (actorRole === 'owner') return role === 'owner';
  if (actorRole === 'executive') return role === 'executive' || role === 'owner';
  if (actorRole === 'manager') return ['manager', 'executive', 'owner'].includes(role);
  return false;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // approval:decide permission required
  const permErr = await requirePermissionAsync(
    context.env,
    auth.sub,
    auth.organizationId,
    auth.role,
    'approval:decide',
  );
  if (permErr) return permErr;

  const approvalId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  let body: { decision?: string; actorName?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const decision = body.decision;
  if (decision !== 'approved' && decision !== 'rejected') {
    return json({ statusCode: 400, message: 'decision must be "approved" or "rejected"' }, 400);
  }

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const approvals = normalize(settings.workflowApprovals);

  const idx = approvals.findIndex((a) => a.id === approvalId);
  if (idx === -1) return json({ statusCode: 404, message: 'Approval not found' }, 404);

  const item = approvals[idx];
  if (item.status !== 'pending') {
    return json({ statusCode: 400, message: 'Approval is already decided' }, 400);
  }

  const stepIdx = item.currentStepIndex;
  const step = item.steps[stepIdx];
  if (!step) return json({ statusCode: 400, message: 'Current step not found' }, 400);

  if (!roleCanActOnStep(auth.role, step.actorRole)) {
    return json(
      { statusCode: 403, message: `Your role (${auth.role}) cannot act on this step` },
      403,
    );
  }

  const now = new Date().toISOString();
  const actorName = body.actorName || auth.email;

  // Update step
  const updatedSteps = item.steps.map((s, i) =>
    i === stepIdx ? { ...s, status: decision, decidedBy: actorName, decidedAt: now } : s,
  );

  let updatedItem: ApprovalRecord;
  if (decision === 'rejected') {
    updatedItem = {
      ...item,
      steps: updatedSteps,
      status: 'rejected',
      decidedAt: now,
      decidedBy: actorName,
    };
  } else {
    const nextIdx = stepIdx + 1;
    if (nextIdx >= item.steps.length) {
      updatedItem = {
        ...item,
        steps: updatedSteps,
        status: 'approved',
        decidedAt: now,
        decidedBy: actorName,
      };
    } else {
      updatedItem = {
        ...item,
        steps: updatedSteps,
        currentStepIndex: nextIdx,
        status: 'pending',
      };
    }
  }

  const nextApprovals = approvals.map((a, i) => (i === idx ? updatedItem : a));
  const nextSettings = { ...settings, workflowApprovals: nextApprovals };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: now })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: `workflow.approval_${decision}`,
    resource: 'approval_request',
    metadata: {
      id: approvalId,
      title: item.title,
      decision,
      step: step.key,
      overall: updatedItem.status,
    },
  });

  // ── Send email notification when final decision is made ───────────────────
  const isFinalDecision = updatedItem.status === 'approved' || updatedItem.status === 'rejected';
  if (isFinalDecision) {
    const mailConfig = resolveMailConfig(context.env);
    if (mailConfig && item.requester && item.requester.includes('@')) {
      const siteUrl = context.request.headers.get('origin') || 'https://eip.ellines.co.ke';
      const statusLabel = updatedItem.status === 'approved' ? 'APPROVED ✓' : 'REJECTED ✗';
      await sendOutboundEmail(context.env, {
        to: item.requester,
        subject: `Approval ${updatedItem.status === 'approved' ? 'approved' : 'rejected'}: ${item.title}`,
        text: [
          `Hello,`,
          '',
          `Your approval request has been ${updatedItem.status.toUpperCase()}.`,
          '',
          `Request: ${item.title}`,
          `Status: ${statusLabel}`,
          `Decided by: ${actorName}`,
          `At: ${new Date(now).toLocaleString()}`,
          item.detail ? `\nDetails: ${item.detail}` : '',
          '',
          `View in Ellines EIP: ${siteUrl}/app/approvals`,
          '',
          `— Ellines EIP Workflow`,
        ]
          .filter((l) => l !== undefined)
          .join('\n'),
      }).catch(() => {/* fire-and-forget */});
    }
  }

  return json(updatedItem);
};
