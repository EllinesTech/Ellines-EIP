import { getAdminClient, json, options, signAccessToken, BCRYPT_ROUNDS, getClientIp, auditRow, type Env } from '../../../shared/auth';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  try {
    const body = (await context.request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
      organizationName?: string;
    };
    const email = (body.email || '').toLowerCase().trim();
    const password = body.password || '';
    const fullName = (body.fullName || '').trim();
    const organizationName = (body.organizationName || '').trim();
    if (!email || !password || !fullName || !organizationName) {
      return json(
        { statusCode: 400, message: 'email, password, fullName, and organizationName are required' },
        400,
      );
    }
    if (password.length < 8) {
      return json({ statusCode: 400, message: 'Password must be at least 8 characters' }, 400);
    }

    const slug = slugify(organizationName);
    if (!slug) {
      return json({ statusCode: 400, message: 'Organization name is invalid' }, 400);
    }

    const supabase = getAdminClient(context.env);
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingEmail) {
      return json({ statusCode: 409, message: 'Email already registered' }, 409);
    }

    const { data: existingSlug } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (existingSlug) {
      return json(
        { statusCode: 409, message: 'Organization name already taken — try a different name' },
        409,
      );
    }

    const now = new Date().toISOString();

    const { error: orgErr } = await supabase.from('organizations').insert({
      id: orgId,
      name: organizationName,
      slug,
      created_at: now,
      updated_at: now,
    });
    if (orgErr) {
      return json({ statusCode: 500, message: orgErr.message }, 500);
    }

    const { error: userErr } = await supabase.from('users').insert({
      id: userId,
      email,
      password_hash: passwordHash,
      full_name: fullName,
      organization_id: orgId,
      role: 'owner',
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    if (userErr) {
      await supabase.from('organizations').delete().eq('id', orgId);
      return json({ statusCode: 500, message: userErr.message }, 500);
    }

    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: userId,
        action: 'auth.register',
        resource: 'organization',
        ip,
      })
    );

    const tokens = await signAccessToken(context.env, {
      sub: userId,
      email,
      organizationId: orgId,
      role: 'owner',
    });

    return json({
      user: {
        id: userId,
        email,
        fullName,
        organizationId: orgId,
        role: 'owner',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      organization: {
        id: orgId,
        name: organizationName,
        slug,
      },
      ...tokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    return json({ statusCode: 500, message }, 500);
  }
};
