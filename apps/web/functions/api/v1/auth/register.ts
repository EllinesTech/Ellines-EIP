import { getAdminClient, json, options, signAccessToken, BCRYPT_ROUNDS, getClientIp, auditRow, type Env } from '../../../shared/auth';
import { checkRateLimit, rateLimitResponse } from '../../../shared/rate-limit';
import { checkContentLength, validateEmail, validatePassword } from '../../../shared/validation';
import { sendOutboundEmail } from '../../../shared/mail';

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
    // Check payload size before parsing
    checkContentLength(context.request, 1_000_000);

    // Rate limit by IP: 5 registrations per hour
    const ip = getClientIp(context.request);
    const limiter = await checkRateLimit(context, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000,
      keyPrefix: 'ratelimit:auth:register',
    }, ip);
    if (!limiter.allowed) {
      return rateLimitResponse(limiter.remaining, limiter.resetAt);
    }

    let body: { email?: unknown; password?: unknown; fullName?: unknown; organizationName?: unknown } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    let email: string;
    let password: string;
    try {
      email = validateEmail(body.email);
      password = validatePassword(body.password, 8);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid email or password';
      return json({ statusCode: 400, message: msg }, 400);
    }

    const fullName = (typeof body.fullName === 'string' ? body.fullName : '').trim();
    const organizationName = (typeof body.organizationName === 'string' ? body.organizationName : '').trim();
    if (!fullName || !organizationName) {
      return json(
        { statusCode: 400, message: 'fullName and organizationName are required' },
        400,
      );
    }
    if (fullName.length > 128) {
      return json({ statusCode: 400, message: 'Full name must be 128 characters or less' }, 400);
    }
    if (organizationName.length > 128) {
      return json({ statusCode: 400, message: 'Organization name must be 128 characters or less' }, 400);
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

    // Fire-and-forget welcome email — does not block the response.
    sendOutboundEmail(context.env, {
      to: email,
      subject: `Welcome to Ellines EIP — ${organizationName}`,
      text: [
        `Hi ${fullName},`,
        ``,
        `Your Ellines EIP account has been created successfully.`,
        ``,
        `Organisation: ${organizationName}`,
        `Email: ${email}`,
        `Role: Owner`,
        ``,
        `You can sign in at any time and start connecting your enterprise systems.`,
        ``,
        `If you did not register for this account, please contact support immediately.`,
        ``,
        `---`,
        `Ellines EIP — Enterprise Intelligence Platform`,
        `Where Enterprise Systems Think Together.`,
      ].join('\n'),
    }).catch(() => {
      // Silent — email secrets not configured or transient failure.
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
    if (err instanceof RangeError && err.message.includes('Payload exceeds')) {
      return json({ statusCode: 413, message: err.message }, 413);
    }
    const message = err instanceof Error ? err.message : 'Registration failed';
    return json({ statusCode: 500, message }, 500);
  }
};
