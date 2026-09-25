/**
 * Platform Super Admin — single connector installation operations.
 *
 * PATCH  …/connector-installations/:connId          — update display name / config
 * PATCH  …/connector-installations/:connId/activate — activate (draft|suspended → active)
 * PATCH  …/connector-installations/:connId/deactivate — deactivate (active → suspended)
 * DELETE …/connector-installations/:connId          — remove entirely
 *
 * All routes are gated on platformAdminFromEnv. A client org member can never
 * activate, deactivate, or remove a connector — this is enforced here AND at
 * the API layer (connector:install is not in any client-org role permission set).
 */
import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../../../shared/auth';
import { toInstallationDto, encryptConnectorConfig, type InstallConfig } from '../../../../../../../shared/connectors';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const connId = context.params.connId as string;
  const supabase = getAdminClient(context.env);

  // ── Verify the installation belongs to this org (tenant isolation) ─────────
  const { data: existing, error: fetchError } = await supabase
    .from('connector_installations')
    .select('*')
    .eq('id', connId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (fetchError) return json({ statusCode: 500, message: fetchError.message }, 500);
  if (!existing) return json({ statusCode: 404, message: 'Connector installation not found' }, 404);

  // ── PATCH: update display name and/or config ───────────────────────────────
  if (context.request.method === 'PATCH') {
    let body: {
      displayName?: string;
      config?: Record<string, unknown>;
      /** 'active' | 'suspended' | 'draft' — direct status override (Super Admin only) */
      status?: string;
    } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.displayName !== undefined) {
      updates.display_name = body.displayName.trim();
    }

    if (body.config !== undefined) {
      updates.config = await encryptConnectorConfig(
        body.config as InstallConfig,
        orgId,
        context.env,
      );
    }

    // Super Admin can directly set status (activate / deactivate / reset to draft)
    if (body.status !== undefined) {
      const allowed = ['draft', 'active', 'suspended', 'error'];
      if (!allowed.includes(body.status)) {
        return json(
          { statusCode: 400, message: `status must be one of: ${allowed.join(', ')}` },
          400,
        );
      }
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 1) {
      // only updated_at — nothing to do
      return json(toInstallationDto(existing as Record<string, unknown>));
    }

    const { data: updated, error: updateError } = await supabase
      .from('connector_installations')
      .update(updates)
      .eq('id', connId)
      .eq('organization_id', orgId)
      .select('*')
      .single();

    if (updateError) return json({ statusCode: 500, message: updateError.message }, 500);

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: auth.sub,
        action: updates.status
          ? `platform.connector.${updates.status}`  // e.g. platform.connector.active
          : 'platform.connector.update',
        resource: 'connector_installation',
        metadata: {
          id: connId,
          catalogId: existing.catalog_id,
          targetOrg: orgId,
          ...(updates.status ? { fromStatus: existing.status, toStatus: updates.status } : {}),
        },
        ip: auth.ip,
      }),
    );

    return json(toInstallationDto(updated as Record<string, unknown>));
  }

  // ── DELETE: remove the connector installation ──────────────────────────────
  if (context.request.method === 'DELETE') {
    const { error: deleteError } = await supabase
      .from('connector_installations')
      .delete()
      .eq('id', connId)
      .eq('organization_id', orgId);

    if (deleteError) return json({ statusCode: 500, message: deleteError.message }, 500);

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: auth.sub,
        action: 'platform.connector.delete',
        resource: 'connector_installation',
        metadata: { id: connId, catalogId: existing.catalog_id, targetOrg: orgId },
        ip: auth.ip,
      }),
    );

    return json({ ok: true });
  }

  return json({ message: 'Method not allowed' }, 405);
};
