import { getAdminClient, json, options, platformAdminFromEnv, requireAuth, type Env } from '../../../../shared/auth';
import { mailProviderLabel } from '../../../../shared/mail';

const TIMEOUT_MS = 2000;
async function probe(label: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    await Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))]);
    return { name: label, status: 'up' as const, latencyMs: Date.now() - started };
  } catch (error) {
    return { name: label, status: 'down' as const, latencyMs: null, error: error instanceof Error ? error.message : 'probe failed' };
  }
}
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  const supabase = getAdminClient(context.env);
  const database = await probe('database', async () => {
    const { error } = await supabase.from('organizations').select('id', { head: true, count: 'exact' });
    if (error) throw error;
  });
  const emailProvider = mailProviderLabel(context.env as Parameters<typeof mailProviderLabel>[0]);
  const email = { name: 'email', status: emailProvider === 'none' ? 'unconfigured' as const : 'up' as const, provider: emailProvider };
  const status = database.status === 'down' ? 'down' : email.status === 'unconfigured' ? 'degraded' : 'ok';
  return json({ status, checkedAt: new Date().toISOString(), dependencies: [database, email] });
};