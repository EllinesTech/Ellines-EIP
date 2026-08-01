import { getAdminClient, json, options, signAccessToken, getClientIp, auditRow, type Env } from '../../../shared/auth';
import {
  isOrganizationSuspended,
  isPlatformAdminEmail,
  parsePlatformAdminEmails,
} from '@ellines-eip/shared';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  try {
    const body = (await context.request.json()) as { email?: string; password?: string };
    const email = (body.email || '').toLowerCase().trim();
    const password = body.password || '';
    if (!email || !password) {
      return json({ statusCode: 400, message: 'Email and password are required' }, 400);
    }

    const supabase = getAdminClient(context.env);
    const bcrypt = await import('bcryptjs');

    const { data: user, error } = await supabase
      .from('users')
      .select(
        'id, email, password_hash, full_name, organization_id, role, is_active, created_at, updated_at, organizations ( id, name, slug, settings )',
      )
      .eq('email', email)
      .maybeSingle();

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }
    if (!user || !user.is_active) {
      return json({ statusCode: 401, message: 'Invalid email or password' }, 401);
    }

    const valid = await bcrypt.compare(password, user.password_hash as string);
    if (!valid) {
      return json({ statusCode: 401, message: 'Invalid email or password' }, 401);
    }

    const orgRel = user.organizations as
      | { id: string; name: string; slug: string; settings?: unknown }
      | { id: string; name: string; slug: string; settings?: unknown }[]
      | null;
    const org = Array.isArray(orgRel) ? orgRel[0] : orgRel;
    if (!org) {
      return json({ statusCode: 500, message: 'Organization missing for user' }, 500);
    }

    const allowlist = parsePlatformAdminEmails(context.env.PLATFORM_ADMIN_EMAILS);
    if (isOrganizationSuspended(org.settings) && !isPlatformAdminEmail(email, allowlist)) {
      return json(
        { statusCode: 403, message: 'This organization is suspended. Contact Ellines support.' },
        403,
      );
    }

    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: user.organization_id as string,
        userId: user.id as string,
        action: 'auth.login',
        resource: 'user',
        ip,
      })
    );

    const tokens = await signAccessToken(context.env, {
      sub: user.id as string,
      email: user.email as string,
      organizationId: user.organization_id as string,
      role: user.role as string,
    });

    return json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        organizationId: user.organization_id,
        role: user.role,
        isActive: user.is_active,
        createdAt: new Date(user.created_at as string).toISOString(),
        updatedAt: new Date(user.updated_at as string).toISOString(),
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      ...tokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    return json({ statusCode: 500, message }, 500);
  }
};
