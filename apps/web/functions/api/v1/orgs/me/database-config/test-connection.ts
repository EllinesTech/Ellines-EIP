import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../shared/auth';

/**
 * Test Database Connection
 * POST /api/v1/orgs/me/database-config/test-connection
 *
 * Test connection to a database without creating it
 * Supports: PostgreSQL (local, Supabase, custom)
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const { type, host, port, username, password, databaseName, supabaseUrl, supabaseKey } = body;

  // Validation
  if (!type) {
    return json({ statusCode: 400, message: 'type is required' }, 400);
  }

  // Since we cannot make direct database connections from Pages Functions,
  // we return a message explaining the limitation
  if (type === 'local' || type === 'custom_postgres') {
    return json(
      {
        statusCode: 503,
        message:
          'Direct PostgreSQL testing from Cloudflare Pages is limited. This configuration will be validated when your backend server connects.',
        advice:
          'Deploy your backend to Render/Railway/similar service for full database validation. For development, test locally first.',
        canTest: false,
        suggestion:
          'Type this URL in your browser to test from a proper backend:\nhttp://localhost:3001/test-db?host=...&port=...&user=...&pass=...&db=...',
      },
      503,
    );
  }

  if (type === 'supabase') {
    // Test Supabase connection (basic validation only)
    if (!supabaseUrl || !supabaseKey) {
      return json(
        { statusCode: 400, message: 'supabaseUrl and supabaseKey are required for Supabase' },
        400,
      );
    }

    // Validate format
    if (!supabaseUrl.includes('supabase.co')) {
      return json(
        { statusCode: 400, message: 'Invalid Supabase URL (must be *.supabase.co)' },
        400,
      );
    }

    if (supabaseKey.length < 20) {
      return json({ statusCode: 400, message: 'Supabase key looks invalid (too short)' }, 400);
    }

    return json({
      success: true,
      message: 'Supabase credentials validated (format OK). Full connection test happens at deployment.',
      canTest: false,
      note: 'Real connectivity test occurs when your backend server connects to Supabase.',
    });
  }

  return json({ statusCode: 400, message: 'Unknown database type' }, 400);
};
