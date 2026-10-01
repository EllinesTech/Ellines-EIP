import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';
import { platformStaffHas } from '../../../../../shared/platform-staff';

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!await platformStaffHas(context.env, auth.email, 'platform.tenants.manage')) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  const settings = asObj(data?.settings);
  const rules = Array.isArray(settings.workflowRules)
    ? settings.workflowRules
    : [];

  return json(rules);
};
