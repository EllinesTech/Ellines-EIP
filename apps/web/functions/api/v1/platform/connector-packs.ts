import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  enforceSafeguards,
  auditRow,
  getClientIp,
  type Env,
} from '../../../shared/auth';
import { redactConfig, toPackDto, type InstallConfig } from '../../../shared/connectors';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const supabase = getAdminClient(context.env);

  // Collection route (no :id) handles GET + POST only. Item routes with :id
  // live in connector-packs/[id].ts (PATCH publish/deprecate/update, DELETE).

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('connector_packs')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json((data || []).map((r) => toPackDto(r as Record<string, unknown>)));
  }

  if (context.request.method === 'POST') {
    const reasonErr = await enforceSafeguards(context, 'platform.connector_pack.create');
    if (reasonErr) return reasonErr;

    let body: {
      slug?: string;
      name?: string;
      description?: string;
      catalogId?: string;
      templateConfig?: InstallConfig;
      fromInstallationId?: string;
      published?: boolean;
      reason?: string;
    } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const slug = (body.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-');
    if (!slug || !body.name?.trim()) {
      return json({ statusCode: 400, message: 'slug and name are required' }, 400);
    }

    let catalogId = body.catalogId || '';
    let templateConfig: InstallConfig = body.templateConfig || {};

    if (body.fromInstallationId) {
      const { data: inst } = await supabase
        .from('connector_installations')
        .select('*')
        .eq('id', body.fromInstallationId)
        .eq('organization_id', auth.organizationId)
        .maybeSingle();
      if (!inst) return json({ statusCode: 404, message: 'Installation not found' }, 404);
      catalogId = inst.catalog_id as string;
      const cfg = redactConfig((inst.config || {}) as Record<string, unknown>);
      delete cfg.apiKey;
      delete cfg.bearerToken;
      delete cfg.basicPass;
      delete cfg.connectionString;
      delete cfg.openApiDocument;
      templateConfig = cfg as InstallConfig;
    }

    if (!catalogId) {
      return json({ statusCode: 400, message: 'catalogId is required' }, 400);
    }

    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      slug,
      name: body.name.trim(),
      description: (body.description || '').trim(),
      catalog_id: catalogId,
      template_config: templateConfig,
      published: body.published !== false,
      created_by_email: auth.email,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('connector_packs')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      return json(
        { statusCode: 400, message: error.message.includes('duplicate') ? 'Pack slug already exists' : error.message },
        400,
      );
    }
    await supabase.from('audit_logs').insert(auditRow({
      organizationId: auth.organizationId, userId: auth.sub,
      action: 'platform.connector_pack.create', resource: 'connector_pack',
      metadata: {
        correlationId: crypto.randomUUID(),
        reason: (body.reason ?? '').toString().trim() || 'connector pack creation', before: null,
        after: { id: data.id, slug, name: body.name.trim(), catalogId, published: body.published !== false },
        result: 'success',
      }, ip: getClientIp(context.request),
    }));
    return json(toPackDto(data as Record<string, unknown>), 201);
  }

  return json({ message: 'Method not allowed' }, 405);
};

// ─── Phase 3: connector-pack item routes (publish / deprecate / update / delete) ─
// Operation IDs + safeguards live in the shared OPERATION_REGISTRY
// (packages/shared/src/safeguards.ts).
type PackUpdateBody = {
  action?: string;
  name?: string;
  description?: string;
  templateConfig?: InstallConfig;
  published?: boolean;
  reason?: string;
};

function toUpdateColumns(body: PackUpdateBody): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.templateConfig !== undefined) updates.template_config = body.templateConfig;
  if (body.published === true) updates.published = true;
  if (body.published === false) updates.published = false;
  return updates;
}

export const onItemRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const id = context.params.id as string;
  if (!id) return json({ statusCode: 400, message: 'Pack id required' }, 400);

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'DELETE') {
    const reasonErr = await enforceSafeguards(context, 'platform.connector_pack.delete');
    if (reasonErr) return reasonErr;

    const { count } = await supabase
      .from('connector_installations')
      .select('id', { count: 'exact', head: true })
      .eq('pack_id', id);
    if ((count ?? 0) > 0) {
      return json(
        { statusCode: 409, message: 'Pack has active installations and cannot be deleted.' },
        409,
      );
    }
    const { error } = await supabase.from('connector_packs').delete().eq('id', id);
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    const deleteBody = (await context.request.clone().json().catch(() => ({}))) as PackUpdateBody;
    await supabase.from('audit_logs').insert(auditRow({
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'platform.connector_pack.delete',
      resource: 'connector_pack',
      metadata: {
        correlationId: crypto.randomUUID(),
        reason: (deleteBody.reason ?? '').toString().trim(),
        before: { id },
        after: null,
        result: 'success',
      },
      ip: getClientIp(context.request),
    }));
    return json({ ok: true });
  }

  if (context.request.method === 'PATCH') {
    let body: PackUpdateBody = {};
    try {
      body = (await context.request.json()) as PackUpdateBody;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const action = body.action?.toLowerCase();
    if (action === 'publish' || action === 'deprecate') {
      const opId = action === 'publish' ? 'platform.connector_pack.publish' : 'platform.connector_pack.deprecate';
      // Body is parsed above, so it must be handed to the safeguard check: a consumed
      // request body cannot be cloned by the helper.
      const reasonErr = await enforceSafeguards(context, opId, body);
      if (reasonErr) return reasonErr;

      const published = action === 'publish';
      const { data, error } = await supabase
        .from('connector_packs')
        .update({ published, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return json({ statusCode: 404, message: error.message }, 404);
      await supabase.from('audit_logs').insert(auditRow({
        organizationId: auth.organizationId,
        userId: auth.sub,
        action: `platform.connector_pack.${action}`,
        resource: 'connector_pack',
        metadata: {
          correlationId: crypto.randomUUID(),
          reason: (body.reason ?? '').toString().trim(),
          before: { published: !published },
          after: { published },
          result: 'success',
        },
        ip: getClientIp(context.request),
      }));
      return json({ id: data.id, slug: data.slug, published: data.published });
    }

    const reasonErr = await enforceSafeguards(context, 'platform.connector_pack.update', body);
    if (reasonErr) return reasonErr;

    const updates = toUpdateColumns(body);
    if (!Object.keys(updates).length) {
      return json({ statusCode: 400, message: 'No pack fields supplied' }, 400);
    }
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('connector_packs')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return json({ statusCode: 404, message: error.message }, 404);
    await supabase.from('audit_logs').insert(auditRow({
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'platform.connector_pack.update',
      resource: 'connector_pack',
      metadata: {
        correlationId: crypto.randomUUID(),
        reason: (body.reason ?? '').toString().trim(),
        before: { updated_at: data.updated_at },
        after: updates,
        result: 'success',
      },
      ip: getClientIp(context.request),
    }));
    return json(data);
  }

  return json({ message: 'Method not allowed' }, 405);
};
