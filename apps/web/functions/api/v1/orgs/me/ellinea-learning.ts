import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

type Trait = { id: string; label: string; detail: string; source: string };

type LearningBlob = {
  feedback: Record<string, { helpful: number; dismiss: number }>;
  dna: {
    organizationId: string;
    updatedAt: string;
    traits: Trait[];
    summary: string;
  } | null;
};

function normalizeLearning(raw: unknown, organizationId: string): LearningBlob {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const feedbackRaw =
    obj.feedback && typeof obj.feedback === 'object' && !Array.isArray(obj.feedback)
      ? (obj.feedback as Record<string, { helpful?: number; dismiss?: number }>)
      : {};
  const feedback: LearningBlob['feedback'] = {};
  for (const [k, v] of Object.entries(feedbackRaw)) {
    if (!v || typeof v !== 'object') continue;
    feedback[k] = {
      helpful: Math.max(0, Number(v.helpful) || 0),
      dismiss: Math.max(0, Number(v.dismiss) || 0),
    };
  }
  let dna: LearningBlob['dna'] = null;
  if (obj.dna && typeof obj.dna === 'object' && !Array.isArray(obj.dna)) {
    const d = obj.dna as Record<string, unknown>;
    const traits: Trait[] = [];
    if (Array.isArray(d.traits)) {
      for (const t of d.traits) {
        if (!t || typeof t !== 'object') continue;
        const row = t as Record<string, unknown>;
        const id = typeof row.id === 'string' ? row.id : '';
        const label = typeof row.label === 'string' ? row.label : '';
        if (!id || !label) continue;
        traits.push({
          id,
          label,
          detail: typeof row.detail === 'string' ? row.detail : '',
          source: typeof row.source === 'string' ? row.source : 'memory',
        });
      }
    }
    dna = {
      organizationId,
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
      summary: typeof d.summary === 'string' ? d.summary : '',
      traits: traits.slice(0, 20),
    };
  }
  return { feedback, dna };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const orgId = auth.organizationId;

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    const settings =
      data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? (data.settings as Record<string, unknown>)
        : {};
    return json(normalizeLearning(settings.ellineaLearning, orgId));
  }

  if (context.request.method === 'PUT') {
    let body: unknown;
    try {
      body = await context.request.json();
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
    const learning = normalizeLearning(body, orgId);
    if (learning.dna) learning.dna.organizationId = orgId;

    const { data: existing, error: readErr } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

    const base =
      existing?.settings &&
      typeof existing.settings === 'object' &&
      !Array.isArray(existing.settings)
        ? { ...(existing.settings as Record<string, unknown>) }
        : {};
    const nextSettings = { ...base, ellineaLearning: learning };

    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', orgId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    return json(learning);
  }

  return json({ message: 'Method not allowed' }, 405);
};
