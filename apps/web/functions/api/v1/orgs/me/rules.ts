/**
 * Pages Function: GET/POST /api/v1/orgs/me/rules
 * Business rules stored in org settings JSON.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

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

function cuid(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_RULES: BusinessRule[] = [
  {
    id: 'rule_alerts',
    name: 'High alerts → approval',
    enabled: true,
    when: 'open_alerts_gte',
    threshold: 3,
    then: 'seed_approval',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'rule_health',
    name: 'Low health → flag Overview',
    enabled: true,
    when: 'health_lt',
    threshold: 70,
    then: 'flag_overview',
    createdAt: new Date(0).toISOString(),
  },
];

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    const settings = asObj(data?.settings);
    const rules = normalize(settings.workflowRules);
    return json(rules.length ? rules : DEFAULT_RULES);
  }

  // POST — Owner/IT only
  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  let body: { name?: string; when?: string; threshold?: number; then?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const name = (body.name || '').trim();
  if (!name || name.length < 3) {
    return json({ statusCode: 400, message: 'name must be at least 3 characters' }, 400);
  }

  const validWhen = ['open_alerts_gte', 'open_decisions_gte', 'health_lt'];
  if (!validWhen.includes(body.when || '')) {
    return json({ statusCode: 400, message: `when must be one of: ${validWhen.join(', ')}` }, 400);
  }

  const validThen = ['seed_approval', 'flag_overview'];
  if (!validThen.includes(body.then || '')) {
    return json({ statusCode: 400, message: `then must be one of: ${validThen.join(', ')}` }, 400);
  }

  const newRule: BusinessRule = {
    id: cuid(),
    name,
    enabled: true,
    when: body.when as string,
    threshold: Number(body.threshold) || 0,
    then: body.then as string,
    createdAt: new Date().toISOString(),
  };

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const rules = normalize(settings.workflowRules);
  const next = [newRule, ...rules].slice(0, 100);
  const nextSettings = { ...settings, workflowRules: next };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'workflow.rule_created',
    resource: 'business_rule',
    metadata: { id: newRule.id, name: newRule.name },
  });

  return json(newRule);
};
