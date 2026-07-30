import {
  getAdminClient,
  json,
  options,
  signSsoChallenge,
  type Env,
} from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  try {
    const body = (await context.request.json()) as { email?: string; provider?: string };
    const email = (body.email || '').toLowerCase().trim();
    const provider = (body.provider || 'email').trim().toLowerCase();
    if (!email) {
      return json({ statusCode: 400, message: 'Email is required' }, 400);
    }

    const base = {
      message:
        'If that work email is registered, a one-time SSO sign-in link has been issued.',
    };

    const supabase = getAdminClient(context.env);
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, organization_id, role, is_active')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }
    if (!user || !user.is_active) {
      return json(base);
    }

    const challenge = await signSsoChallenge(context.env, {
      sub: user.id as string,
      email: user.email as string,
      organizationId: user.organization_id as string,
      role: user.role as string,
    });

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: user.organization_id,
      user_id: user.id,
      action: 'auth.sso_request',
      resource: 'user',
      metadata: { provider },
      created_at: new Date().toISOString(),
    });

    // Until notification service exists, return token so the client can complete SSO (MVP).
    return json({
      ...base,
      ...challenge,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SSO request failed';
    return json({ statusCode: 500, message }, 500);
  }
};
