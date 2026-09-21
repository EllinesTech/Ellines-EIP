/**
 * Pages Function: DELETE /api/v1/orgs/me/child/:id
 * Owner deletes a linked child organization directly under their current org.
 * Cascades (via DB FKs) to that org's users, branches, departments, etc.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  getClientIp,
  auditRow,
  type Env,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'DELETE') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (auth.role !== 'owner') {
    return json(
      { statusCode: 403, message: 'Only the Organization Owner can delete linked organizations' },
      403,
    );
  }

  const childId = (context.params as { id?: string }).id;
  if (!childId) {
    return json({ statusCode: 400, message: 'Missing organization id' }, 400);
  }
  if (childId === auth.organizationId) {
    return json({ statusCode: 403, message: 'Cannot delete the current organization' }, 403);
  }

  const supabase = getAdminClient(context.env);

  const { data: childOrg, error: fetchErr } = await supabase
    .from('organizations')
    .select('id, name, parent_org_id')
    .eq('id', childId)
    .maybeSingle();

  if (fetchErr) return json({ statusCode: 500, message: fetchErr.message }, 500);
  if (!childOrg) return json({ statusCode: 404, message: 'Organization not found' }, 404);
  if (childOrg.parent_org_id !== auth.organizationId) {
    return json(
      { statusCode: 403, message: 'You can only delete organizations linked directly under your own' },
      403,
    );
  }

  const ip = getClientIp(context.request);
  await supabase.from('audit_logs').insert(
    auditRow({
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'org.delete_child',
      resource: 'organization',
      metadata: { childOrgId: childOrg.id, childOrgName: childOrg.name },
      ip,
    }),
  );

  const { error: deleteErr } = await supabase.from('organizations').delete().eq('id', childId);
  if (deleteErr) return json({ statusCode: 500, message: deleteErr.message }, 500);

  return json({ id: childId, deleted: true });
};
