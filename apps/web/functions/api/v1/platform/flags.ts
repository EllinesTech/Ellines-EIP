import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
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

async function getFlags(env: Env): Promise<FeatureFlag[]> {
  // Stored in Supabase under a special "platform" org record or as a top-level KV
  // For simplicity: store in a dedicated row in enterprise_snapshots with org_id = 'platform'
  // We use the organizations table settings of a well-known platform org, or fall back to defaults.
  const supabase = getAdminClient(env);
  const { data } = await supabase
    .from('organizations')
    .select('settings')
    .eq('slug', 'ellines-platform')
    .maybeSingle();

  if (!data) return DEFAULT_FLAGS;

  const stored = (data.settings as Record<string, unknown>)?.[FLAGS_KEY];
  if (!Array.isArray(stored)) return DEFAULT_FLAGS;

  // Merge stored values into defaults so new flags appear automatically
  const storedMap = new Map((stored as FeatureFlag[]).map((f) => [f.key, f.enabled]));
  return DEFAULT_FLAGS.map((flag) => ({
    ...flag,
    enabled: storedMap.has(flag.key) ? (storedMap.get(flag.key) as boolean) : flag.enabled,
  }));
}

async function saveFlags(env: Env, flags: FeatureFlag[]): Promise<void> {
  const supabase = getAdminClient(env);
  // Upsert a platform org record if it doesn't exist
  const { data: existing } = await supabase
    .from('organizations')
    .select('id, settings')
    .eq('slug', 'ellines-platform')
    .maybeSingle();

  if (existing) {
    const settings = { ...(existing.settings as Record<string, unknown>), [FLAGS_KEY]: flags };
    await supabase.from('organizations').update({ settings }).eq('slug', 'ellines-platform');
  }
  // If no platform org exists, flags are ephemeral (default on restart) — acceptable for now
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
    try {
      const body = await context.request.json() as
        | { key: string; enabled: boolean }
        | { key: string; enabled: boolean }[];

      const updates = Array.isArray(body) ? body : [body];
      const flags = await getFlags(context.env);

      for (const update of updates) {
        const flag = flags.find((f) => f.key === update.key);
        if (flag) flag.enabled = update.enabled;
      }

      await saveFlags(context.env, flags);
      return json({ statusCode: 200, data: flags });
    } catch (err) {
      return json({ statusCode: 400, message: 'Invalid request body' }, 400);
    }
  }

  return json({ message: 'Method not allowed' }, 405);
};
