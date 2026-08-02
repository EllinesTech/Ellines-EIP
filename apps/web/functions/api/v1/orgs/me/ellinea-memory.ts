import {
  normalizeEllineaMemoryNotes,
  mergeOrganizationSettings,
  type EllineaMemoryNoteDto,
} from '@ellines-eip/shared';
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';

function readMemoryFromSettings(settings: unknown): EllineaMemoryNoteDto[] {
  const obj =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return normalizeEllineaMemoryNotes(obj.ellineaMemory);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    // ellinea:manage permission for reading memory
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'ellinea:manage',
    );
    if (permErr) return permErr;

    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json(readMemoryFromSettings(data?.settings));
  }

  if (context.request.method === 'PUT') {
    // ellinea:manage permission for writing memory
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'ellinea:manage',
    );
    if (permErr) return permErr;

    let body: unknown;
    try {
      body = await context.request.json();
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
    const notes = normalizeEllineaMemoryNotes(
      Array.isArray(body) ? body : (body as { notes?: unknown })?.notes,
    );

    const { data: existing, error: readErr } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

    const nextSettings = mergeOrganizationSettings(existing?.settings, {
      ellineaMemory: notes,
    });
    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    return json(notes);
  }

  return json({ message: 'Method not allowed' }, 405);
};
