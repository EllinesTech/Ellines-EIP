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
import { SECRET_KEYS } from '../../../../shared/connectors';

// Re-export SECRET_KEYS so this file doesn't need to know the list
const CONNECTOR_SECRET_KEYS = SECRET_KEYS;

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

  const result = {
    dryRun: body.dryRun === true,
    // database_configurations migration
    dbConfigs: { scanned: 0, migrated: 0, alreadyCurrent: 0, failed: 0 },
    // connector_installations migration
    connectors: { scanned: 0, migrated: 0, alreadyCurrent: 0, failed: 0 },
    failures: [] as { table: string; id: string; field: string; message: string }[],
  };

  // ── 1. database_configurations ────────────────────────────────────────────
  {
    let q = supabase
      .from('database_configurations')
      .select('id, organization_id, password_encrypted, supabase_key_encrypted')
      .order('created_at', { ascending: true });
    if (body.organizationId) q = q.eq('organization_id', body.organizationId);
    const { data: rows, error } = await q;
    if (error) return json({ statusCode: 500, message: `database_configurations: ${error.message}` }, 500);

    for (const row of rows || []) {
      result.dbConfigs.scanned += 1;
      for (const field of ['password_encrypted', 'supabase_key_encrypted'] as const) {
        const value = row[field] as string | null;
        if (!value) continue;
        try {
          if (isEncrypted(value)) {
            const parsed = JSON.parse(value) as { version?: number };
            if (Number(parsed.version) === 2) {
              await migrateToEncryption(value, row.organization_id, context.env);
              result.dbConfigs.alreadyCurrent += 1;
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
          result.dbConfigs.migrated += 1;
        } catch (err) {
          result.dbConfigs.failed += 1;
          result.failures.push({ table: 'database_configurations', id: row.id, field, message: err instanceof Error ? err.message : 'Migration failed' });
        }
      }
    }
  }

  // ── 2. connector_installations — encrypt credential fields in config JSON ──
  {
    let q = supabase
      .from('connector_installations')
      .select('id, organization_id, config')
      .order('created_at', { ascending: true });
    if (body.organizationId) q = q.eq('organization_id', body.organizationId);
    const { data: rows, error } = await q;
    if (error) return json({ statusCode: 500, message: `connector_installations: ${error.message}` }, 500);

    for (const row of rows || []) {
      result.connectors.scanned += 1;
      const config = (row.config || {}) as Record<string, unknown>;
      let changed = false;
      const updatedConfig = { ...config };

      for (const key of CONNECTOR_SECRET_KEYS) {
        const value = updatedConfig[key];
        if (typeof value !== 'string' || !value) continue;
        try {
          if (isEncrypted(value)) {
            const parsed = JSON.parse(value) as { version?: number };
            if (Number(parsed.version) === 2) {
              result.connectors.alreadyCurrent += 1;
              continue;
            }
          }
          // Plaintext or old version — migrate
          updatedConfig[key] = await migrateToEncryption(value, row.organization_id, context.env);
          changed = true;
        } catch (err) {
          result.connectors.failed += 1;
          result.failures.push({ table: 'connector_installations', id: row.id, field: key, message: err instanceof Error ? err.message : 'Migration failed' });
        }
      }

      if (changed) {
        if (!body.dryRun) {
          const { error: writeError } = await supabase
            .from('connector_installations')
            .update({ config: updatedConfig, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          if (writeError) {
            result.connectors.failed += 1;
            result.failures.push({ table: 'connector_installations', id: row.id, field: 'config', message: writeError.message });
            continue;
          }
        }
        result.connectors.migrated += 1;
      }
    }
  }

  await supabase.from('audit_logs').insert(auditRow({
    organizationId: auth.organizationId,
    userId: auth.sub,
    action: 'platform.security.encryption_migration',
    resource: 'encryption_migration',
    metadata: {
      dryRun: result.dryRun,
      dbConfigs: result.dbConfigs,
      connectors: result.connectors,
      failureCount: result.failures.length,
      requestedOrganizationId: body.organizationId || null,
      actorEmail: auth.email,
    },
    ip: auth.ip,
  }));

  return json(result);
};
