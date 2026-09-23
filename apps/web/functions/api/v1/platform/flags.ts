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
import type { PagesFunction } from '@cloudflare/workers-types';

interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  note: string;
}

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: 'ellinea_chat',
    label: 'Ellinea chat',
    enabled: false,
    note: 'Unlocks Ask Ellinea production chat',
  },
  {
    key: 'live_connectors',
    label: 'Live connectors',
    enabled: false,
    note: 'Integration Hub sync to Command Center',
  },
  {
    key: 'ceo_daily_brief',
    label: 'CEO Daily Brief',
    enabled: false,
    note: 'Automated morning summary delivery',
  },
  {
    key: 'sso_login',
    label: 'SSO Login',
    enabled: true,
    note: 'Allow OAuth2/SAML SSO login for orgs that have configured a provider',
  },
  {
    key: 'custom_roles',
    label: 'Custom Roles (RBAC)',
    enabled: true,
    note: 'Allow Owners to create custom permission roles (Track D)',
  },
  {
    key: 'multi_org',
    label: 'Multi-org (child orgs)',
    enabled: true,
    note: 'Allow owners to create linked child organisations',
  },
];

const FLAGS_KEY = 'platform_feature_flags';

async function ensurePlatformSettingsOrg(env: Env): Promise<{ id: string; settings: Record<string, unknown> }> {
  const supabase = getAdminClient(env);
  const { data: existing } = await supabase
    .from('organizations')
    .select('id, settings')
    .eq('slug', 'ellines-platform')
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      settings: (existing.settings as Record<string, unknown>) || {},
    };
  }

  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      id,
      name: 'Ellines EIP Platform',
      slug: 'ellines-platform',
      settings: { systemTenant: true },
    })
    .select('id, settings')
    .single();

  if (error) throw new Error('Unable to initialize platform settings: ' + error.message);
  return { id: data.id, settings: (data.settings as Record<string, unknown>) || {} };
}

async function getFlags(env: Env): Promise<FeatureFlag[]> {
  const platformOrg = await ensurePlatformSettingsOrg(env);
  const stored = platformOrg.settings[FLAGS_KEY];
  if (!Array.isArray(stored)) return DEFAULT_FLAGS;

  const storedMap = new Map((stored as FeatureFlag[]).map((f) => [f.key, f.enabled]));
  return DEFAULT_FLAGS.map((flag) => ({
    ...flag,
    enabled: storedMap.has(flag.key) ? Boolean(storedMap.get(flag.key)) : flag.enabled,
  }));
}

async function saveFlags(env: Env, flags: FeatureFlag[]): Promise<void> {
  const platformOrg = await ensurePlatformSettingsOrg(env);
  const settings = { ...platformOrg.settings, [FLAGS_KEY]: flags, systemTenant: true };
  const supabase = getAdminClient(env);
  const { error } = await supabase.from('organizations').update({ settings }).eq('id', platformOrg.id);
  if (error) throw new Error('Unable to persist platform feature flags: ' + error.message);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  // GET — list all flags
  if (context.request.method === 'GET') {
    const flags = await getFlags(context.env);
    return json(flags);
  }

  // PATCH — toggle one or many flags
  // Body: [{ key: string, enabled: boolean }, ...]  OR  { key: string, enabled: boolean }
  if (context.request.method === 'PATCH') {
    const reasonErr = await enforceSafeguards(context, 'platform.feature_flag.update');
    if (reasonErr) return reasonErr;

    try {
      const body = await context.request.json() as
        | { key: string; enabled: boolean; reason?: string }
        | { key: string; enabled: boolean; reason?: string }[];

      const updates = Array.isArray(body) ? body : [body];
      const before = await getFlags(context.env);
      const flags = before.map((flag) => ({ ...flag }));
      for (const update of updates) {
        const flag = flags.find((f) => f.key === update.key);
        if (flag && typeof update.enabled === 'boolean') flag.enabled = update.enabled;
      }
      await saveFlags(context.env, flags);
      const changed = flags.filter((flag) => before.find((b) => b.key === flag.key)?.enabled !== flag.enabled);
      if (changed.length) {
        const reasons = updates
          .filter((u) => typeof u.reason === 'string' && u.reason.trim())
          .map((u) => u.reason!.trim());
        await getAdminClient(context.env).from('audit_logs').insert(auditRow({
          organizationId: auth.organizationId, userId: auth.sub,
          action: 'platform.feature_flag.update', resource: 'feature_flag',
          metadata: {
            correlationId: crypto.randomUUID(),
            reason: reasons.join('; ') || 'platform feature flag change',
            before: before.filter((b) => changed.some((c) => c.key === b.key)),
            after: changed, result: 'success',
          }, ip: getClientIp(context.request),
        }));
      }
      return json({ statusCode: 200, data: flags });
    } catch (err) {
      return json({ statusCode: 400, message: 'Invalid request body' }, 400);
    }
  }

  return json({ message: 'Method not allowed' }, 405);
};
