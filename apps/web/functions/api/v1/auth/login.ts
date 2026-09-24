import { getAdminClient, json, options, platformAdminFromEnv, signAccessToken, getClientIp, auditRow, hashToken, type Env } from '../../../shared/auth';
import { checkRateLimit, rateLimitResponse } from '../../../shared/rate-limit';
import { checkLoginLockout, clearLoginFailures, lockoutResponse, recordLoginFailure } from '../../../shared/lockout';
import { validateEmail, validatePassword, checkContentLength } from '../../../shared/validation';
import {
  isOrganizationSuspended,
  isPlatformAdminEmail,
  parsePlatformAdminEmails,
  ttlToMs,
} from '@ellines-eip/shared';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  try {
    // Check payload size
    checkContentLength(context.request, 1_000_000);

    // Rate limit by IP: 10 attempts per minute
    const ip = getClientIp(context.request);
    const limiter = await checkRateLimit(context, {
      maxRequests: 10,
      windowMs: 60000,
      keyPrefix: 'ratelimit:auth:login',
    }, ip);

    if (!limiter.allowed) {
      return rateLimitResponse(limiter.remaining, limiter.resetAt);
    }

    // Validate input
    let body: Record<string, unknown>;
    try {
      body = (await context.request.json()) as Record<string, unknown>;
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

    // Account lockout (spec 24.4.1): 5 failures / 15 min -> 15 min lock, keyed on
    // the submitted email alone so existing and unknown accounts behave identically.
    const lockout = await checkLoginLockout(context, email);
    if (lockout.locked) {
      return lockoutResponse(lockout.retryAfterMs);
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
      await recordLoginFailure(context, email);
      return json({ statusCode: 401, message: 'Invalid email or password' }, 401);
    }

    const valid = await bcrypt.compare(password, user.password_hash as string);
    if (!valid) {
      await recordLoginFailure(context, email);
      return json({ statusCode: 401, message: 'Invalid email or password' }, 401);
    }

    // Successful authentication resets the lockout failure state (spec 24.4.1).
    await clearLoginFailures(context, email);

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

    // ip already captured above for rate limiting — reuse it
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

    // Session-registry groundwork (spec 24.2.3): record the issued token hash so
    // the session can be revoked (POST /auth/logout). Non-fatal until migration
    // 0003_phase2_session_registry is applied — login never fails because of it.
    try {
      const { error: sessionError } = await supabase.from('sessions').insert({
        id: crypto.randomUUID(),
        user_id: user.id as string,
        organization_id: user.organization_id as string,
        token_hash: await hashToken(tokens.accessToken),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlToMs(tokens.expiresIn)).toISOString(),
      });
      if (sessionError) {
        console.warn('[login] session registry write skipped:', sessionError.message);
      }
    } catch (err) {
      console.warn('[login] session registry write skipped:', err);
    }

    const isPlatformAdmin = platformAdminFromEnv(context.env, user.email as string);

    // Audit log every platform admin login — this is a privileged event
    if (isPlatformAdmin) {
      void (supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        organization_id: user.organization_id as string,
        user_id: user.id as string,
        action: 'auth.platform_admin.login',
        resource: 'session',
        metadata: {
          email: user.email,
          ip: context.request.headers.get('cf-connecting-ip') ?? 'unknown',
          country: context.request.headers.get('cf-ipcountry') ?? 'unknown',
          userAgent: context.request.headers.get('user-agent')?.slice(0, 200) ?? 'unknown',
        },
      }) as unknown as Promise<unknown>).catch(() => {/* non-fatal */});
    }

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
      isPlatformAdmin,
    });
  } catch (err) {
    // Handle payload size errors with 413 status
    if (err instanceof RangeError && err.message.includes('Payload exceeds')) {
      return json({ statusCode: 413, message: err.message }, 413);
    }
    const message = err instanceof Error ? err.message : 'Login failed';
    return json({ statusCode: 500, message }, 500);
  }
};
