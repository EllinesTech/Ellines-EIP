/**
 * Pages Function: POST /api/v1/orgs/me/create-child
 * Owner creates a new child organization linked to the current one.
 * The owner automatically gets a membership row in the child org.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Only org owners can create child orgs
  if (auth.role !== 'owner') {
    return json(
      { statusCode: 403, message: 'Only the Organization Owner can create linked organizations' },
      403,
    );
  }

  // IMPORTANT: With v1.1 multi-org support, verify the user is an active owner
  // in the CURRENT org (auth.organizationId) by checking organization_memberships.
  // The JWT claims contain role in the primary org; this is a security-in-depth check.
  const supabase = getAdminClient(context.env);
  const { data: currentOrgMem, error: memErr } = await supabase
    .from('organization_memberships')
    .select('role, is_active')
    .eq('user_id', auth.sub)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (memErr) {
    return json({ statusCode: 500, message: memErr.message }, 500);
  }

  // If membership row exists (v1.1+), verify active + owner role
  if (currentOrgMem) {
    if (!currentOrgMem.is_active) {
      return json(
        { statusCode: 403, message: 'Your membership in this org is inactive' },
        403,
      );
    }
    if (currentOrgMem.role !== 'owner') {
      return json(
        { statusCode: 403, message: 'Only the Organization Owner can create linked organizations' },
        403,
      );
    }
  }
  // If no membership row (legacy single-org), auth.role check above suffices

  let body: { name?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const name = (body.name || '').trim();
  if (!name || name.length < 2) {
    return json({ statusCode: 400, message: 'Organization name must be at least 2 characters' }, 400);
  }

  const slug = slugify(name);
  if (!slug) {
    return json({ statusCode: 400, message: 'Organization name is invalid' }, 400);
  }

  const now = new Date().toISOString();

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return json(
      { statusCode: 409, message: 'Organization name already taken — try a different name' },
      409,
    );
  }

  const childOrgId = crypto.randomUUID();

  // Create child org
  const { error: orgErr } = await supabase.from('organizations').insert({
    id: childOrgId,
    name,
    slug,
    parent_org_id: auth.organizationId,
    created_at: now,
    updated_at: now,
  });
  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);

  // Create membership for the owner in the child org
  const membershipId = crypto.randomUUID();
  const { error: memberErr } = await supabase.from('organization_memberships').insert({
    id: membershipId,
    user_id: auth.sub,
    organization_id: childOrgId,
    role: 'owner',
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  if (memberErr) {
    // Rollback org
    await supabase.from('organizations').delete().eq('id', childOrgId);
    return json({ statusCode: 500, message: memberErr.message }, 500);
  }

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'org.create_child',
    resource: 'organization',
    metadata: { childOrgId, childOrgName: name },
    created_at: now,
  });

  return json({
    id: childOrgId,
    name,
    slug,
    parentOrgId: auth.organizationId,
    createdAt: now,
  });
};
