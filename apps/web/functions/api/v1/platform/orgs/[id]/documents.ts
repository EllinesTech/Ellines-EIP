import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('documents')
      .select('id, name, mime_type, size_bytes, tags, branch, department, summary, uploaded_by, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (error.code === '42P01' || error.message?.includes('schema cache')) return json([]);
      return json({ statusCode: 500, message: error.message }, 500);
    }

    return json(
      (data || []).map((d) => ({
        id: d.id,
        name: d.name,
        mimeType: d.mime_type,
        sizeBytes: d.size_bytes,
        tags: d.tags || [],
        branch: d.branch || null,
        department: d.department || null,
        summary: d.summary || null,
        uploadedBy: d.uploaded_by,
        uploadedAt: d.created_at,
      })),
    );
  }

  if (context.request.method === 'POST') {
    let body: {
      name?: string;
      mimeType?: string;
      content?: string;
      tags?: string[];
      branch?: string;
      summary?: string;
    } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const name = (body.name || '').trim();
    if (!name) return json({ statusCode: 400, message: 'name is required' }, 400);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('documents')
      .insert({
        id: crypto.randomUUID(),
        organization_id: orgId,
        name,
        mime_type: body.mimeType || 'text/plain',
        size_bytes: new TextEncoder().encode(body.content || '').length,
        content: body.content || '',
        tags: body.tags || [],
        branch: body.branch || null,
        summary: body.summary || null,
        uploaded_by: auth.email,
        created_at: now,
        updated_at: now,
      })
      .select('id, name, mime_type, size_bytes, tags, branch, department, summary, uploaded_by, created_at')
      .single();

    if (error) {
      if (error.code === '42P01') return json({ statusCode: 501, message: 'Documents table not yet migrated' }, 501);
      return json({ statusCode: 500, message: error.message }, 500);
    }

    return json({
      id: data.id,
      name: data.name,
      mimeType: data.mime_type,
      sizeBytes: data.size_bytes,
      tags: data.tags || [],
      branch: data.branch || null,
      department: data.department || null,
      summary: data.summary || null,
      uploadedBy: data.uploaded_by,
      uploadedAt: data.created_at,
    });
  }

  return json({ message: 'Method not allowed' }, 405);
};
