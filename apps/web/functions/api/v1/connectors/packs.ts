import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../shared/auth';
import { toPackDto } from '../../../shared/connectors';

/** Published packs for Org IT to install with credentials only. */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const supabase = getAdminClient(context.env);
  const { data, error } = await supabase
    .from('connector_packs')
    .select('*')
    .eq('published', true)
    .order('updated_at', { ascending: false });
  if (error) return json({ statusCode: 500, message: error.message }, 500);
  return json((data || []).map((r) => toPackDto(r as Record<string, unknown>)));
};
