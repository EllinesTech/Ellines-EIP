import {
  auditRow,
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

/**
 * POST /api/v1/dashboards/:id/duplicate
 * Creates a copy with name "{original} (Copy)", isDefault=false, visibility=PRIVATE.
 * Requirements: 3.1
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const id = context.params['id'] as string;
  const supabase = getAdminClient(context.env);

  const { data: original, error } = await supabase
    .from('client_dashboards')
    .select('*')
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .single();

  if (error || !original) return json({ statusCode: 404, message: 'Dashboard not found' }, 404);

  const { data: copy, error: insertErr } = await supabase
    .from('client_dashboards')
    .insert({
      organization_id: auth.organizationId,
      owner_user_id: auth.sub,
      name: `${original.name as string} (Copy)`,
      description: original.description,
      type: original.type,
      visibility: 'PRIVATE',
      is_default: false,
      layout_config: original.layout_config,
      refresh_policy: original.refresh_policy,
    })
    .select()
    .single();

  if (insertErr) return json({ statusCode: 500, message: insertErr.message }, 500);

  await supabase.from('audit_logs').insert(
    auditRow({
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'dashboard:duplicated',
      resource: copy.id,
      metadata: { source_id: id },
    }),
  );

  return json({ dashboard: copy }, 201);
};
