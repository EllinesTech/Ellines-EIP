/**
 * Pages Function: /api/v1/orgs/me/api-keys
 *
 * Org-scoped API key management.
 * Keys are stored in org settings (JSON field `apiKeys`).
 * The actual key value is shown ONCE on creation; stored as a SHA-256 hash.
 *
 * GET    → list keys (masked)
 * POST   → create key (returns full value once)
 * DELETE → revoke key  (body: { id })
 */
import {
  getAdminClient,
  hashToken,
  json,
  options,
  randomTokenHex,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';

type ApiKeyRecord = {
  id: string;
  name: string;
  keyHash: string;
  keyPreview: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

async function readKeys(supabase: ReturnType<typeof getAdminClient>, orgId: string): Promise<ApiKeyRecord[]> {
  const { data } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();
  const s = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = s.apiKeys;
  if (!Array.isArray(raw)) return [];
  return (raw as ApiKeyRecord[]).filter((x) => x && typeof x.id === 'string');
}

async function writeKeys(
  supabase: ReturnType<typeof getAdminClient>,
  orgId: string,
  keys: ApiKeyRecord[],
) {
  const { data } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();
  const s = Object.assign({}, (data?.settings ?? {}) as Record<string, unknown>);
  s.apiKeys = keys.slice(0, 20);
  await supabase
    .from('organizations')
    .update({ settings: s, updated_at: new Date().toISOString() })
    .eq('id', orgId);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  // ── GET: list keys ────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const permErr = await requirePermissionAsync(
      context.env, auth.sub, auth.organizationId, auth.role, 'org:*',
    );
    if (permErr) return permErr;
    const keys = await readKeys(supabase, auth.organizationId);
    // Never expose keyHash
    return json(keys.map(({ keyHash: _h, ...rest }) => rest));
  }

  // ── POST: create key ──────────────────────────────────────────────────────
  if (context.request.method === 'POST') {
    const permErr = await requirePermissionAsync(
      context.env, auth.sub, auth.organizationId, auth.role, 'org:*',
    );
    if (permErr) return permErr;

    let body: { name?: string; expiresInDays?: number } = {};
    try { body = await context.request.json() as typeof body; } catch {
      return json({ statusCode: 400, message: 'Invalid JSON' }, 400);
    }

    const name = (body.name || '').trim();
    if (!name || name.length < 2) return json({ statusCode: 400, message: 'name must be at least 2 characters' }, 400);

    const rawKey = `eip_${randomTokenHex(28)}`; // e.g. eip_abc123...
    const keyHash = await hashToken(rawKey);
    const keyPreview = `eip_…${rawKey.slice(-6)}`;
    const now = new Date().toISOString();
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString()
      : null;

    const newKey: ApiKeyRecord = {
      id: crypto.randomUUID(),
      name,
      keyHash,
      keyPreview,
      createdAt: now,
      createdBy: auth.email,
      lastUsedAt: null,
      expiresAt,
    };

    const keys = await readKeys(supabase, auth.organizationId);
    await writeKeys(supabase, auth.organizationId, [newKey, ...keys]);

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'org.api_key_created',
      resource: 'api_key',
      metadata: { name, keyPreview },
    });

    // Return full key ONCE
    const { keyHash: _h, ...safeKey } = newKey;
    return json({ ...safeKey, key: rawKey }, 201);
  }

  // ── DELETE: revoke key ────────────────────────────────────────────────────
  if (context.request.method === 'DELETE') {
    const permErr = await requirePermissionAsync(
      context.env, auth.sub, auth.organizationId, auth.role, 'org:*',
    );
    if (permErr) return permErr;

    let body: { id?: string } = {};
    try { body = await context.request.json() as typeof body; } catch { /* ignore */ }
    const id = (body.id || '').trim();
    if (!id) return json({ statusCode: 400, message: 'id required' }, 400);

    const keys = await readKeys(supabase, auth.organizationId);
    const found = keys.find((k) => k.id === id);
    if (!found) return json({ statusCode: 404, message: 'API key not found' }, 404);

    await writeKeys(supabase, auth.organizationId, keys.filter((k) => k.id !== id));

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'org.api_key_revoked',
      resource: 'api_key',
      metadata: { name: found.name, keyPreview: found.keyPreview },
    });

    return json({ ok: true });
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
