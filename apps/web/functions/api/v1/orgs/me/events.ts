/**
 * Pages Function: GET/POST /api/v1/orgs/me/events
 * Enterprise event bus log stored in org settings JSON.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

type EnterpriseEvent = {
  id: string; type: string; payload: Record<string, unknown>; at: string;
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalize(raw: unknown): EnterpriseEvent[] {
  if (!Array.isArray(raw)) return [];
  return (raw as EnterpriseEvent[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  ).slice(0, 200);
}

function cuid(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

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
    return json(normalize(settings.workflowEvents));
  }

  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  let body: { type?: string; payload?: Record<string, unknown> };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const type =
    typeof body.type === 'string' ? body.type.trim().slice(0, 80) : 'unknown';

  const event: EnterpriseEvent = {
    id: cuid(),
    type,
    payload: body.payload || {},
    at: new Date().toISOString(),
  };

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const events = normalize(settings.workflowEvents);
  const next = [event, ...events].slice(0, 200);
  const nextSettings = { ...settings, workflowEvents: next };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: event.at })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  return json(event);
};
