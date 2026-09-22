/**
 * Pages Function: POST /api/v1/platform/orgs/create
 *
 * Platform Super Admin only.
 * Creates a new organization + optional owner user in one transaction.
 */
import {
  BCRYPT_ROUNDS,
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  let body: {
    name?: string;
    slug?: string;
    ownerEmail?: string;
    ownerFullName?: string;
    ownerPassword?: string;
  } = {};
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const name = (body.name || '').trim();
  if (!name) return json({ statusCode: 400, message: 'Organization name is required' }, 400);

  const slug = (body.slug || slugify(name)).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!slug) return json({ statusCode: 400, message: 'Could not derive a valid slug' }, 400);

  const supabase = getAdminClient(context.env);

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return json({ statusCode: 409, message: `Slug "${slug}" is already taken. Choose a different organization name or slug.` }, 409);
  }

  const now = new Date().toISOString();
  const orgId = crypto.randomUUID();

  // Create org
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ id: orgId, name, slug, settings: {}, created_at: now, updated_at: now })
    .select('id, name, slug, created_at')
    .single();

  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);

  let owner: { id: string; email: string; fullName: string; role: string } | null = null;

  // Optionally create an owner user
  if (body.ownerEmail) {
    const ownerEmail = body.ownerEmail.trim().toLowerCase();
    const ownerFullName = (body.ownerFullName || 'Org Owner').trim();
    const ownerPassword = (body.ownerPassword || '').trim();

    if (!ownerPassword || ownerPassword.length < 8) {
      // Rollback org creation
      await supabase.from('organizations').delete().eq('id', orgId);
      return json({ statusCode: 400, message: 'ownerPassword must be at least 8 characters' }, 400);
    }

    // Check email uniqueness
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', ownerEmail)
      .maybeSingle();
    if (existingUser) {
      await supabase.from('organizations').delete().eq('id', orgId);
      return json({ statusCode: 409, message: `Email "${ownerEmail}" is already registered` }, 409);
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(ownerPassword, BCRYPT_ROUNDS);
    const ownerId = crypto.randomUUID();

    const { data: ownerRow, error: ownerErr } = await supabase
      .from('users')
      .insert({
        id: ownerId,
        email: ownerEmail,
        full_name: ownerFullName,
        password_hash: passwordHash,
        organization_id: orgId,
        role: 'owner',
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select('id, email, full_name, role')
      .single();

    if (ownerErr) {
      await supabase.from('organizations').delete().eq('id', orgId);
      return json({ statusCode: 500, message: ownerErr.message }, 500);
    }

    owner = {
      id: ownerRow.id,
      email: ownerRow.email,
      fullName: ownerRow.full_name,
      role: ownerRow.role,
    };
  }

  // Audit log
  await supabase.from('audit_logs').insert(
    auditRow({
      organizationId: orgId,
      userId: auth.sub,
      action: 'platform.org.create',
      resource: 'organization',
      metadata: { name, slug, ownerEmail: owner?.email ?? null, createdBy: auth.email },
      ip: auth.ip,
    }),
  );

  return json(
    {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: new Date(org.created_at as string).toISOString(),
      userCount: owner ? 1 : 0,
      status: 'active',
      owner,
    },
    201,
  );
};
