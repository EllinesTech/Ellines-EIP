/**
 * Pages Function: PATCH/DELETE /api/v1/orgs/me/rules/:id
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../shared/auth';

type BusinessRule = {
  id: string; name: string; enabled: boolean;
  when: string; threshold: number; then: string; createdAt: string;
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalize(raw: unknown): BusinessRule[] {
  if (!Array.isArray(raw)) return [];
  return (raw as BusinessRule[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  ).slice(0, 100);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  const ruleId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const rules = normalize(settings.workflowRules);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return json({ statusCode: 404, message: 'Rule not found' }, 404);

  let next: BusinessRule[];
  let result: BusinessRule | { ok: boolean };

  if (context.request.method === 'PATCH') {
    let body: { enabled?: boolean };
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
    const updated = { ...rules[idx], enabled: Boolean(body.enabled) };
    next = rules.map((r, i) => (i === idx ? updated : r));
    result = updated;
  } else if (context.request.method === 'DELETE') {
    next = rules.filter((_, i) => i !== idx);
    result = { ok: true };
  } else {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const nextSettings = { ...settings, workflowRules: next };
  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  return json(result);
};
