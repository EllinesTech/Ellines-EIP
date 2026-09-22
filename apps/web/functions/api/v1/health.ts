import { json, options, type Env, getAdminClient } from '../../shared/auth';

const PROBE_TIMEOUT_MS = 2000;

async function probeDatabase(env: Env): Promise<{ status: 'up' | 'down'; latencyMs: number | null }> {
  const started = Date.now();
  try {
    const supabase = getAdminClient(env);
    const result = await Promise.race([
      supabase.from('organizations').select('id', { head: true, count: 'exact' }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS)),
    ]);
    return { status: result.error ? 'down' : 'up', latencyMs: Date.now() - started };
  } catch {
    return { status: 'down', latencyMs: null };
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  const database = await probeDatabase(context.env);
  return json({ status: database.status === 'up' ? 'ok' : 'down', service: 'ellines-eip-pages', timestamp: new Date().toISOString() });
};