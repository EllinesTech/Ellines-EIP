/**
 * Pages Function: GET/POST /api/v1/orgs/me/approvals
 *
 * Proxies to Identity Nest service when IDENTITY_API_URL is set.
 * Falls back to storing approval data in org settings JSON (Supabase).
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

interface EnvWithIdentity extends Env {
  IDENTITY_API_URL?: string;
}

const APPROVAL_TEMPLATES: Record<string, { key: string; label: string; actorRole: string }[]> = {
  simple: [{ key: 'owner_decide', label: 'Decide', actorRole: 'decider' }],
  it_then_owner: [
    { key: 'it_review', label: 'IT review', actorRole: 'admin' },
    { key: 'owner_decide', label: 'Owner decide', actorRole: 'owner' },
  ],
  manager_exec_owner: [
    { key: 'manager_review', label: 'Manager review', actorRole: 'manager' },
    { key: 'exec_review', label: 'Executive review', actorRole: 'executive' },
    { key: 'owner_decide', label: 'Owner decide', actorRole: 'owner' },
  ],
};

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

function normalize(raw: unknown): ApprovalRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ApprovalRecord[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  ).slice(0, 80);
}

function cuid(): string {
  return `appr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const onRequest: PagesFunction<EnvWithIdentity> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  // ── GET: list approvals ────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    const settings = asObj(data?.settings);
    return json(normalize(settings.workflowApprovals));
  }

  // ── POST: create approval ─────────────────────────────────────────────────
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  let body: { title?: string; detail?: string; templateId?: string; source?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const title = (body.title || '').trim();
  if (!title || title.length < 3) {
    return json({ statusCode: 400, message: 'title must be at least 3 characters' }, 400);
  }

  const templateId = ['simple', 'it_then_owner', 'manager_exec_owner'].includes(
    body.templateId || '',
  )
    ? (body.templateId as string)
    : 'simple';

  const stepTemplates = APPROVAL_TEMPLATES[templateId] ?? APPROVAL_TEMPLATES['simple'];
  const steps: ApprovalStep[] = stepTemplates.map((s) => ({
    key: s.key,
    label: s.label,
    status: 'pending',
    actorRole: s.actorRole,
    decidedBy: null,
    decidedAt: null,
  }));

  const newItem: ApprovalRecord = {
    id: cuid(),
    title,
    detail: (body.detail || '').trim(),
    requester: auth.email,
    status: 'pending',
    templateId,
    currentStepIndex: 0,
    source: body.source || 'manual',
    decidedAt: null,
    decidedBy: null,
    createdAt: new Date().toISOString(),
    steps,
  };

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const approvals = normalize(settings.workflowApprovals);
  const next = [newItem, ...approvals].slice(0, 80);
  const nextSettings = { ...settings, workflowApprovals: next };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'workflow.approval_created',
    resource: 'approval_request',
    metadata: { id: newItem.id, title: newItem.title, templateId: newItem.templateId },
  });

  return json(newItem);
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}
