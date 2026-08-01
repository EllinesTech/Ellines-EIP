import { getAdminClient, json, options, type Env } from '../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * GET /api/v1/orgs/{slug}/sso-providers
 * Public endpoint to list SSO providers for a specific org
 * Used on login page to show available enterprise SSO options
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const { slug } = context.params;

  try {
    const supabase = getAdminClient(context.env);

    // Get organization by slug
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (orgError || !org) {
      return json({ statusCode: 404, message: 'Organization not found' }, 404);
    }

    // Get active SSO providers
    const { data: providers, error } = await supabase
      .from('sso_providers')
      .select('id, type, name, is_active')
      .eq('organization_id', org.id)
      .eq('is_active', true);

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }

    return json({
      statusCode: 200,
      data: providers || [],
    });
  } catch (err) {
    console.error('Error fetching SSO providers:', err);
    return json({ statusCode: 500, message: 'Failed to fetch providers' }, 500);
  }
};
