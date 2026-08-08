/**
 * Dev Pages API: GET/POST /api/v1/orgs/me/database-config
 * Pages Router API routes are IGNORED during static export builds.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, getDevSupabase, requireDevAuth, isOrgAdmin } from '../../_dev-auth';

async function encrypt(plaintext: string, orgId: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`org:${orgId}`)),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyMaterial, new TextEncoder().encode(plaintext));
  return JSON.stringify({ encrypted: true, version: 1, iv: btoa(String.fromCharCode(...iv)), ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;
  if (!isOrgAdmin(auth.role)) { devJson(res, { statusCode: 403, message: 'Admins only' }, 403); return; }

  const supabase = getDevSupabase();

  if (req.method === 'GET') {
    const { data: configs, error } = await supabase
      .from('database_configurations').select('*').eq('organization_id', auth.organizationId)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: false });
    if (error) { devJson(res, { statusCode: 500, message: error.message }, 500); return; }
    devJson(res, (configs || []).map((c) => ({ ...c, passwordEncrypted: c.passwordEncrypted ? '••••••••' : null, supabaseKeyEncrypted: c.supabaseKeyEncrypted ? '••••••••' : null })));
    return;
  }

  if (req.method === 'POST') {
    const { name, type, host, port, username, password, databaseName, supabaseUrl, supabaseKey, sslMode } = req.body || {};
    if (!name || !type) { devJson(res, { statusCode: 400, message: 'name and type are required' }, 400); return; }
    if (!['local', 'supabase', 'custom_postgres'].includes(type)) { devJson(res, { statusCode: 400, message: 'type must be: local | supabase | custom_postgres' }, 400); return; }

    const { data: existing } = await supabase.from('database_configurations').select('id').eq('organization_id', auth.organizationId).eq('name', name).maybeSingle();
    if (existing) { devJson(res, { statusCode: 409, message: `Config "${name}" already exists` }, 409); return; }

    const encryptedPassword = password ? await encrypt(password, auth.organizationId) : null;
    const encryptedSupabaseKey = supabaseKey ? await encrypt(supabaseKey, auth.organizationId) : null;

    const { data: newConfig, error: insertErr } = await supabase.from('database_configurations').insert({
      id: crypto.randomUUID(), organization_id: auth.organizationId, name, type,
      host: host || (type === 'local' ? 'localhost' : null), port: port || 5432, username: username || null,
      password_encrypted: encryptedPassword, database_name: databaseName || null,
      supabase_url: supabaseUrl || null, supabase_key_encrypted: encryptedSupabaseKey,
      ssl_mode: sslMode || 'require', is_primary: false, is_active: true, test_status: 'untested',
      created_by: auth.sub, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('*').single();

    if (insertErr) { devJson(res, { statusCode: 500, message: insertErr.message }, 500); return; }
    devJson(res, newConfig, 201);
    return;
  }

  devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405);
}
