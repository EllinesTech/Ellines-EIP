import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';

type MemoryNote = { id: string; title: string; body: string; updatedAt: string };

function normalizeNotes(raw: unknown): MemoryNote[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryNote[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const n = item as Record<string, unknown>;
    const id = typeof n.id === 'string' ? n.id : '';
    const title = typeof n.title === 'string' ? n.title.trim() : '';
    const body = typeof n.body === 'string' ? n.body.trim() : '';
    if (!id || !title || !body) continue;
    out.push({
      id,
      title,
      body,
      updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : new Date().toISOString(),
    });
    if (out.length >= 40) break;
  }
  return out;
}

function buildGrounding(input: {
  question: string;
  summary: Record<string, unknown> | null;
  memory: MemoryNote[];
}): string {
  const lines: string[] = [];
  const s = input.summary;
  if (s && s.status === 'synced') {
    lines.push(
      `Snapshot: health ${s.healthScore}, alerts ${s.openAlerts}, decisions ${s.openDecisions}, connector ${s.connectorName}. ${s.briefHighlight || ''}`,
    );
    const timeline = Array.isArray(s.timeline) ? s.timeline.slice(0, 5) : [];
    for (const ev of timeline) {
      const e = ev as { title?: string; detail?: string };
      if (e.title) lines.push(`Timeline: ${e.title}${e.detail ? ` — ${e.detail}` : ''}`);
    }
  }
  for (const n of input.memory.slice(0, 8)) {
    lines.push(`Memory “${n.title}”: ${n.body}`);
  }
  if (!lines.length) {
    return 'No live enterprise snapshot or memory notes available yet.';
  }
  return lines.join('\n');
}

async function callLlm(
  env: Env,
  question: string,
  grounding: string,
): Promise<{ answer: string; provider: string } | null> {
  const key = env.ELLINEA_LLM_API_KEY || env.OPENAI_API_KEY;
  if (!key) return null;
  const base = (env.ELLINEA_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.ELLINEA_LLM_MODEL || 'gpt-4o-mini';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content:
            'You are Ellinea AI for Ellines EIP. Answer only from the provided enterprise grounding. If grounding is insufficient, say what sync or memory is missing. Be concise.',
        },
        {
          role: 'user',
          content: `Grounding:\n${grounding}\n\nQuestion: ${question}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM provider error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) return null;
  return { answer, provider: model };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: {
    question?: string;
    summary?: Record<string, unknown> | null;
    memory?: unknown;
    templateAnswer?: string;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question.length < 2) {
    return json({ statusCode: 400, message: 'question is required' }, 400);
  }

  const supabase = getAdminClient(context.env);
  const { data: org } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  const settings =
    org?.settings && typeof org.settings === 'object' && !Array.isArray(org.settings)
      ? (org.settings as Record<string, unknown>)
      : {};
  const serverMemory = normalizeNotes(settings.ellineaMemory);
  const clientMemory = normalizeNotes(body.memory);
  const memory = serverMemory.length ? serverMemory : clientMemory;

  const grounding = buildGrounding({
    question,
    summary: body.summary || null,
    memory,
  });

  try {
    const llm = await callLlm(context.env, question, grounding);
    if (llm) {
      return json({
        answer: llm.answer,
        mode: 'llm',
        provider: llm.provider,
        groundingChars: grounding.length,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LLM failed';
    return json(
      {
        answer:
          typeof body.templateAnswer === 'string' && body.templateAnswer
            ? body.templateAnswer
            : `Ellinea could not reach the LLM provider (${message}). Falling back to template reasoning is recommended on the client.`,
        mode: 'error',
        error: message,
        groundingChars: grounding.length,
      },
      200,
    );
  }

  return json({
    answer:
      typeof body.templateAnswer === 'string' && body.templateAnswer
        ? body.templateAnswer
        : `RAG grounding ready (${grounding.length} chars) but no ELLINEA_LLM_API_KEY / OPENAI_API_KEY is configured. Use the template engine answer.`,
    mode: 'rag_template',
    groundingChars: grounding.length,
  });
};
