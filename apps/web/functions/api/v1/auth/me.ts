import {
  bearerToken,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  verifyAccessToken,
  type Env,
} from '../../../shared/auth';

const MAX_AVATAR_CHARS = 180_000;

function mapUser(user: Record<string, unknown>) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    title: (user.title as string | null) ?? null,
    bio: (user.bio as string | null) ?? null,
    avatarUrl: (user.avatar_url as string | null) ?? null,
    organizationId: user.organization_id,
    role: user.role,
    isActive: user.is_active,
    createdAt: new Date(user.created_at as string).toISOString(),
    updatedAt: new Date(user.updated_at as string).toISOString(),
  };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET' && context.request.method !== 'PATCH') {
    return json({ message: 'Method not allowed' }, 405);
  }

  try {
    const token = bearerToken(context.request);
    if (!token) {
      return json({ statusCode: 401, message: 'Unauthorized' }, 401);
    }

    let claims: { sub: string };
    try {
      claims = await verifyAccessToken(context.env, token);
    } catch {
      return json({ statusCode: 401, message: 'Unauthorized' }, 401);
    }

    const supabase = getAdminClient(context.env);
    const select =
      'id, email, full_name, title, bio, avatar_url, organization_id, role, is_active, created_at, updated_at, organizations ( id, name, slug )';

    if (context.request.method === 'PATCH') {
      let body: {
        fullName?: string;
        title?: string;
        bio?: string;
        avatarUrl?: string;
      } = {};
      try {
        body = (await context.request.json()) as typeof body;
      } catch {
        return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
      }

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (body.fullName !== undefined) {
        const name = String(body.fullName).trim();
        if (name.length < 2) {
          return json(
            { statusCode: 400, message: 'Full name must be at least 2 characters' },
            400,
          );
        }
        patch.full_name = name;
      }
      if (body.title !== undefined) {
        patch.title = String(body.title).trim() || null;
      }
      if (body.bio !== undefined) {
        const bio = String(body.bio).trim();
        if (bio.length > 500) {
          return json({ statusCode: 400, message: 'Bio must be 500 characters or less' }, 400);
        }
        patch.bio = bio || null;
      }
      if (body.avatarUrl !== undefined) {
        const raw = String(body.avatarUrl).trim();
        if (!raw) {
          patch.avatar_url = null;
        } else if (!raw.startsWith('data:image/')) {
          return json(
            { statusCode: 400, message: 'Avatar must be an image data URL' },
            400,
          );
        } else if (raw.length > MAX_AVATAR_CHARS) {
          return json(
            { statusCode: 400, message: 'Avatar image is too large — use a smaller photo' },
            400,
          );
        } else {
          patch.avatar_url = raw;
        }
      }

      if (Object.keys(patch).length <= 1) {
        return json({ statusCode: 400, message: 'No profile fields to update' }, 400);
      }

      const { data: updated, error: updErr } = await supabase
        .from('users')
        .update(patch)
        .eq('id', claims.sub)
        .select(select)
        .maybeSingle();

      if (updErr) {
        return json({ statusCode: 500, message: updErr.message }, 500);
      }
      if (!updated || !updated.is_active) {
        return json({ statusCode: 401, message: 'User not found' }, 401);
      }

      const orgRel = updated.organizations as
        | { id: string; name: string; slug: string }
        | { id: string; name: string; slug: string }[]
        | null;
      const org = Array.isArray(orgRel) ? orgRel[0] : orgRel;
      if (!org) {
        return json({ statusCode: 500, message: 'Organization missing for user' }, 500);
      }

      return json({
        user: mapUser(updated as Record<string, unknown>),
        organization: { id: org.id, name: org.name, slug: org.slug },
        isPlatformAdmin: platformAdminFromEnv(context.env, updated.email as string),
      });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select(select)
      .eq('id', claims.sub)
      .maybeSingle();

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }
    if (!user || !user.is_active) {
      return json({ statusCode: 401, message: 'User not found' }, 401);
    }

    const orgRel = user.organizations as
      | { id: string; name: string; slug: string }
      | { id: string; name: string; slug: string }[]
      | null;
    const org = Array.isArray(orgRel) ? orgRel[0] : orgRel;
    if (!org) {
      return json({ statusCode: 500, message: 'Organization missing for user' }, 500);
    }

    return json({
      user: mapUser(user as Record<string, unknown>),
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      isPlatformAdmin: platformAdminFromEnv(context.env, user.email as string),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return json({ statusCode: 500, message }, 500);
  }
};
