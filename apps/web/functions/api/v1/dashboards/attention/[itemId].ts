import {
  auditRow,
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

/**
 * DELETE /api/v1/dashboards/attention/:itemId
 * Dismisses an attention item. Writes audit record.
 * Requirements: 6.4
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'DELETE') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const itemId = context.params['itemId'] as string;
  const supabase = getAdminClient(context.env);

  // Parse category and severity from the composite itemId (e.g. "connector-abc123")
  const [category] = itemId.split('-');

  await auditRow(supabase, {
    organizationId: auth.organizationId,
    userId: auth.sub,
    action: 'attention:dismissed',
    resource: itemId,
    metadata: {
      item_id: itemId,
      category: category ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
  });

  return json({ dismissed: true, itemId });
};
