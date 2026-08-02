/**
 * Pages Function: GET/POST/DELETE /api/v1/orgs/me/documents
 * Document Hub — upload, browse and retrieve org documents.
 * Documents are stored as base64-encoded data in org settings JSON (MVP).
 * Each document entry stores: id, name, type, size, tags, branch, uploadedBy, uploadedAt, content.
 * Max single document: 500 KB (base64); max 50 documents per org.
 */
import {
  getAdminClient,
  isOrgAdminRole,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';

const MAX_DOCS = 50;
const MAX_DOC_BYTES = 500 * 1024; // 500 KB per document (base64 encoded)

export type DocumentRecord = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  branch?: string;
  department?: string;
  summary?: string;
  uploadedBy: string;
  uploadedAt: string;
  /** Base64-encoded file content (stored server-side only, not returned in list) */
  content?: string;
};

function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function normalizeDocs(raw: unknown): DocumentRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as DocumentRecord[])
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .slice(0, MAX_DOCS);
}

function stripContent(doc: DocumentRecord): Omit<DocumentRecord, 'content'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { content: _c, ...rest } = doc;
  return rest;
}

function cuid(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Permission check per operation
  if (context.request.method === 'GET') {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'document:view',
    );
    if (permErr) return permErr;
  } else if (context.request.method === 'POST') {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'document:upload',
    );
    if (permErr) return permErr;
  } else if (context.request.method === 'DELETE') {
    // DELETE requires document:delete
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'document:delete',
    );
    if (permErr) return permErr;
  }

  const supabase = getAdminClient(context.env);

  // ── GET: list documents (no content) ─────────────────────────────────────
  if (context.request.method === 'GET') {
    const url = new URL(context.request.url);
    const docId = url.searchParams.get('id');

    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);

    const settings = asObj(data?.settings);
    const docs = normalizeDocs(settings.documents);

    // Download single document (with content)
    if (docId) {
      const doc = docs.find((d) => d.id === docId);
      if (!doc) return json({ statusCode: 404, message: 'Document not found' }, 404);
      return json(doc);
    }

    return json(docs.map(stripContent));
  }

  // ── POST: upload document ─────────────────────────────────────────────────
  if (context.request.method === 'POST') {
    let body: {
      name?: string;
      mimeType?: string;
      content?: string; // base64
      tags?: string[];
      branch?: string;
      department?: string;
      summary?: string;
    };
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const name = (body.name || '').trim();
    if (!name) return json({ statusCode: 400, message: 'name is required' }, 400);
    if (!body.content) return json({ statusCode: 400, message: 'content (base64) is required' }, 400);

    // Validate size
    const sizeBytes = Math.round((body.content.length * 3) / 4);
    if (sizeBytes > MAX_DOC_BYTES) {
      return json(
        {
          statusCode: 413,
          message: `Document exceeds ${MAX_DOC_BYTES / 1024}KB limit (${Math.round(sizeBytes / 1024)}KB).`,
        },
        413,
      );
    }

    const { data: existing, error: readErr } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

    const settings = asObj(existing?.settings);
    const docs = normalizeDocs(settings.documents);

    if (docs.length >= MAX_DOCS) {
      return json(
        {
          statusCode: 413,
          message: `Organization has reached the document limit (${MAX_DOCS}). Remove some documents first.`,
        },
        413,
      );
    }

    const now = new Date().toISOString();
    const newDoc: DocumentRecord = {
      id: cuid(),
      name,
      mimeType: body.mimeType || 'application/octet-stream',
      sizeBytes,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 10).map(String) : [],
      branch: body.branch || undefined,
      department: body.department || undefined,
      summary: body.summary ? body.summary.slice(0, 500) : undefined,
      uploadedBy: auth.email,
      uploadedAt: now,
      content: body.content,
    };

    const nextDocs = [newDoc, ...docs].slice(0, MAX_DOCS);
    const nextSettings = { ...settings, documents: nextDocs };

    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: now })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'documents.upload',
      resource: 'document',
      metadata: { id: newDoc.id, name: newDoc.name, mimeType: newDoc.mimeType, sizeBytes },
    });

    return json(stripContent(newDoc));
  }

  // ── DELETE: remove document ───────────────────────────────────────────────
  if (context.request.method === 'DELETE') {
    let body: { id?: string };
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const docId = body.id;
    if (!docId) return json({ statusCode: 400, message: 'id is required' }, 400);

    const { data: existing, error: readErr } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

    const settings = asObj(existing?.settings);
    const docs = normalizeDocs(settings.documents);
    const target = docs.find((d) => d.id === docId);
    if (!target) return json({ statusCode: 404, message: 'Document not found' }, 404);

    // Only uploader or org admin can delete
    if (target.uploadedBy !== auth.email && !isOrgAdminRole(auth.role)) {
      return json({ statusCode: 403, message: 'Only the uploader or an admin can delete this document' }, 403);
    }

    const nextDocs = docs.filter((d) => d.id !== docId);
    const nextSettings = { ...settings, documents: nextDocs };

    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'documents.delete',
      resource: 'document',
      metadata: { id: docId, name: target.name },
    });

    return json({ ok: true });
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
