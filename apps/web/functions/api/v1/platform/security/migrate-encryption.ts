import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import { isEncrypted, migrateToEncryption } from '../../../../shared/encryption';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const supabase = getAdminClient(context.env);
  let body: { dryRun?: boolean; organizationId?: string } = {};
  try { body = await context.request.json() as typeof body; } catch { /* empty body is valid */ }

  let q = supabase
    .from('database_configurations')
    .select('id, organization_id, password_encrypted, supabase_key_encrypted')
    .order('created_at', { ascending: true });
  if (body.organizationId) q = q.eq('organization_id', body.organizationId);

  const { data: rows, error } = await q;
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const result = {
    dryRun: body.dryRun === true,
    scanned: 0,
    migrated: 0,
    alreadyCurrent: 0,
    failed: 0,
    failures: [] as { configId: string; field: string; message: string }[],
  };

  for (const row of rows || []) {
    result.scanned += 1;
    for (const field of ['password_encrypted', 'supabase_key_encrypted'] as const) {
      const value = row[field] as string | null;
      if (!value) continue;

      try {
        if (isEncrypted(value)) {
          const parsed = JSON.parse(value) as { version?: number };
          if (Number(parsed.version) === 2) {
            // Validate current encryption without changing the stored value.
            await migrateToEncryption(value, row.organization_id, context.env);
            result.alreadyCurrent += 1;
            continue;
          }
        }

        const migrated = await migrateToEncryption(value, row.organization_id, context.env);
        if (!body.dryRun) {
          const { error: writeError } = await supabase
            .from('database_configurations')
            .update({ [field]: migrated, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          if (writeError) throw new Error(writeError.message);
        }
        result.migrated += 1;
      } catch (error) {
        result.failed += 1;
        result.failures.push({
          configId: row.id,
          field,
          message: error instanceof Error ? error.message : 'Migration failed',
        });
      }
    }
  }

  await supabase.from('audit_logs').insert(auditRow({
    organizationId: auth.organizationId,
    userId: auth.sub,
    action: 'platform.security.encryption_migration',
    resource: 'database_configuration',
    metadata: {
      dryRun: result.dryRun,
      scanned: result.scanned,
      migrated: result.migrated,
      alreadyCurrent: result.alreadyCurrent,
      failed: result.failed,
      requestedOrganizationId: body.organizationId || null,
      actorEmail: auth.email,
    },
    ip: auth.ip,
  }));

  return json(result);
};
