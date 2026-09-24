import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data, error } = await supabase
    .from('connector_installations')
    .select('id, connector_id, config, status, last_sync, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  return json(data || []);
};
