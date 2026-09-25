import {
  mergeOrganizationSettings,
  readPlatformOrgStatus,
} from '@ellines-eip/shared';
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

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string | undefined;
  if (!orgId) return json({ statusCode: 400, message: 'Organization id required' }, 400);

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'PATCH') {
    let body: { status?: string } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
    const status = body.status === 'suspended' ? 'suspended' : body.status === 'active' ? 'active' : null;
    if (!status) {
      return json({ statusCode: 400, message: 'status must be active or suspended' }, 400);
    }

    const { data: existing, error: readErr } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at, settings')
      .eq('id', orgId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);
    if (!existing) return json({ statusCode: 404, message: 'Organization not found' }, 404);

    const nextSettings = mergeOrganizationSettings(existing.settings, {
      platformStatus: status,
    });
    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', orgId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: auth.sub,
      action: status === 'suspended' ? 'platform.org.suspend' : 'platform.org.resume',
      resource: 'organization',
      metadata: { actorEmail: auth.email, status, slug: existing.slug },
      created_at: new Date().toISOString(),
    });

    return json({
      id: existing.id,
      name: existing.name,
      slug: existing.slug,
      createdAt: new Date(existing.created_at as string).toISOString(),
      userCount: count ?? 0,
      status: readPlatformOrgStatus({ platformStatus: status }),
    });
  }

  // ── DELETE: permanently remove an organization and all its data ─────────────
  // This is a hard delete. Prisma cascades handle connector_installations,
  // users, enterprise_snapshots, audit_logs, and all other org-owned rows.
  // Requires explicit 'reason' in body — written to the operator audit log.
  if (context.request.method === 'DELETE') {
    let body: { reason?: string } = {};
    try {
      const text = await context.request.text();
      if (text.trim()) body = JSON.parse(text) as typeof body;
    } catch { /* no body is fine */ }

    const reason = (body.reason || '').trim();
    if (!reason) {
      return json(
        { statusCode: 400, message: 'A reason is required to delete an organization' },
        400,
      );
    }

    const { data: target, error: readErr } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('id', orgId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);
    if (!target) return json({ statusCode: 404, message: 'Organization not found' }, 404);

    // Write audit record BEFORE deleting (cascade would remove it otherwise)
    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: auth.sub,
      action: 'platform.org.delete',
      resource: 'organization',
      metadata: { actorEmail: auth.email, orgName: target.name, slug: target.slug, reason },
      created_at: new Date().toISOString(),
    });

    const { error: deleteErr } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (deleteErr) return json({ statusCode: 500, message: deleteErr.message }, 500);

    return json({ ok: true, deleted: { id: orgId, name: target.name, slug: target.slug } });
  }

  return json({ message: 'Method not allowed' }, 405);
};
