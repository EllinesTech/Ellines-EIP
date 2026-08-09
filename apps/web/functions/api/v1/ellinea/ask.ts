import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermission,
  type Env,
} from '../../../shared/auth';
import { sendOutboundEmail } from '../../../shared/mail';

type MemoryNote = { id: string; title: string; body: string; updatedAt: string };
type DnaTrait = { id?: string; label?: string; detail?: string; source?: string };
type DnaSnapshot = { summary?: string; traits?: DnaTrait[] };

const ELLINEA_SYSTEM_PROMPT = `You are Ellinea AI for Ellines EIP (Enterprise Intelligence Platform by Ellines Tech).

Mission: enterprise intelligence ABOVE Systems of Record (ERP, CRM, HIS, etc.). EIP connects, observes, and wraps — it does NOT replace SoR and must NEVER invent SoR writes, mutations, or fake live records.

Principles:
1. Answer ONLY from the provided grounding (snapshot, UEM, timeline, Memory, DNA, learning signals, role). If grounding is insufficient, say exactly what sync, Memory note, or Approval data is missing.
2. Structure answers for operators: Situation → Evidence → Risk → Recommended action → Confidence (approximate %).
3. Cite sources by type when you use them: [snapshot], [alert], [decision], [uem], [timeline], [memory], [dna], [learning].
4. Role actionability:
   - Owner: org-wide risk, Approvals authority, IT grants — decide or clearly delegate to IT.
   - IT Admin: connector sync health, access hygiene, read-only wrap of SoR — fix platform side, do not invent SoR edits.
   - Executive/Manager/Member: in-lane watch and escalate authority issues to Owner/IT.
   - Viewer: observe only; no write guidance.
5. Prefer concrete next steps tied to Alerts, Approvals, Attention objects, Memory policies, and DNA caution traits. Avoid generic chatbot filler.
6. Be concise and ops-precise. Temperature is low — stay grounded.`;

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

function normalizeDna(raw: unknown): DnaSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = raw as DnaSnapshot;
  return {
    summary: typeof d.summary === 'string' ? d.summary : undefined,
    traits: Array.isArray(d.traits) ? d.traits.slice(0, 12) : [],
  };
}

function buildGrounding(input: {
  question: string;
  summary: Record<string, unknown> | null;
  memory: MemoryNote[];
  dna?: DnaSnapshot | null;
  role?: string;
  organizationName?: string;
}): string {
  const lines: string[] = [];
  if (input.organizationName || input.role) {
    lines.push(
      `Role lens: org=${input.organizationName || 'unknown'}, role=${input.role || 'member'}. Frame Owner/IT vs work-role authority accordingly.`,
    );
  }
  const s = input.summary;
  if (s && s.status === 'synced') {
    lines.push(
      `[snapshot] Health ${s.healthScore}/100, alerts ${s.openAlerts}, decisions ${s.openDecisions}, connector ${s.connectorName}. ${s.briefHighlight || ''}`,
    );
    if (Number(s.openAlerts) > 0) {
      lines.push(`[alert] ${s.openAlerts} open alert(s) in latest sync — triage before trusting calm.`);
    }
    if (Number(s.openDecisions) > 0) {
      lines.push(`[decision] ${s.openDecisions} open decision(s)/tasks — Approvals authority required for org-wide calls.`);
    }
    const model = s.model as
      | {
          counts?: Record<string, number>;
          objects?: Array<{ kind?: string; name?: string; status?: string }>;
          capabilities?: string[];
        }
      | null
      | undefined;
    const counts = model?.counts;
    if (counts) {
      lines.push(
        `[uem] Branches ${counts.branches ?? 0}, people ${counts.people ?? 0}, tasks ${counts.tasks ?? 0}, notifications ${counts.notifications ?? 0}.`,
      );
    }
    const attention = (model?.objects || []).filter((o) =>
      (o.status || '').toLowerCase().includes('attention'),
    );
    for (const o of attention.slice(0, 4)) {
      lines.push(`[uem] Attention: ${o.kind || 'object'} ${o.name || ''}`);
    }
    const timeline = Array.isArray(s.timeline) ? s.timeline.slice(0, 5) : [];
    for (const ev of timeline) {
      const e = ev as { title?: string; detail?: string };
      if (e.title) lines.push(`[timeline] ${e.title}${e.detail ? ` — ${e.detail}` : ''}`);
    }
    if (model?.capabilities?.length) {
      lines.push(`[snapshot] Capabilities: ${model.capabilities.join(', ')}`);
    }
  }
  for (const n of input.memory.slice(0, 8)) {
    lines.push(`[memory] “${n.title}”: ${n.body}`);
  }
  if (input.dna?.summary) {
    lines.push(`[dna] ${input.dna.summary}`);
    for (const t of (input.dna.traits || []).slice(0, 6)) {
      if (t?.label) lines.push(`[dna] ${t.label}${t.detail ? ` — ${t.detail}` : ''}`);
    }
  }
  lines.push(`[learning] Question for retrieval bias: ${input.question.slice(0, 200)}`);
  if (!lines.length) {
    return 'No live enterprise snapshot or memory notes available yet.';
  }
  return lines.join('\n');
}

async function callLlm(
  env: Env,
  question: string,
  grounding: string,
  role?: string,
): Promise<{ answer: string; provider: string } | null> {
  const key = env.ELLINEA_LLM_API_KEY || env.OPENAI_API_KEY;
  if (!key) return null;
  const base = (env.ELLINEA_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.ELLINEA_LLM_MODEL || 'gpt-4o-mini';

  const roleHint = role
    ? `\nSigned-in role: ${role}. Make the Recommended action match that authority (Owner/IT decide; others escalate).`
    : '';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: ELLINEA_SYSTEM_PROMPT + roleHint,
        },
        {
          role: 'user',
          content: `Grounding (cite source tags):\n${grounding}\n\nQuestion: ${question.slice(0, 500)}\n\nRespond with Situation → Evidence → Risk → Recommended action → Confidence. Grounding-only.`,
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
    dna?: unknown;
    role?: string;
    organizationName?: string;
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
  const dna = normalizeDna(body.dna);
  const role = typeof body.role === 'string' ? body.role : auth.role;
  const organizationName =
    typeof body.organizationName === 'string' ? body.organizationName : undefined;

  const actorEmail = auth.email;

  const grounding = buildGrounding({
    question,
    summary: body.summary || null,
    memory,
    dna,
    role,
    organizationName,
  });

  /** Send a real email to the user's registered address with the Q&A result. */
  async function notifyUser(answer: string, mode: string): Promise<void> {
    const userEmail = actorEmail;
    if (!userEmail) return;
    const orgLabel = organizationName ? ` — ${organizationName}` : '';
    const subject = `Ellinea AI response${orgLabel}`;
    const text = [
      `Your Ellinea AI request has been processed.`,
      ``,
      `Question:`,
      question,
      ``,
      `Answer (${mode}):`,
      answer,
      ``,
      `---`,
      `Ellines EIP — Enterprise Intelligence Platform`,
      `This email was sent because you submitted a request through Ellinea AI.`,
    ].join('\n');

    // Fire-and-forget — don't let email failure block the API response.
    sendOutboundEmail(context.env, { to: userEmail, subject, text }).catch(() => {
      // silent — no email secrets configured or transient failure
    });
  }

  try {
    const llm = await callLlm(context.env, question, grounding, role);
    if (llm) {
      void notifyUser(llm.answer, `llm:${llm.provider}`);
      return json({
        answer: llm.answer,
        mode: 'llm',
        provider: llm.provider,
        groundingChars: grounding.length,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LLM failed';
    const fallbackAnswer =
      typeof body.templateAnswer === 'string' && body.templateAnswer
        ? body.templateAnswer
        : `Ellinea could not reach the LLM provider (${message}). Falling back to template reasoning is recommended on the client.`;
    void notifyUser(fallbackAnswer, 'error');
    return json(
      {
        answer: fallbackAnswer,
        mode: 'error',
        error: message,
        groundingChars: grounding.length,
      },
      200,
    );
  }

  const ragAnswer =
    typeof body.templateAnswer === 'string' && body.templateAnswer
      ? body.templateAnswer
      : `RAG grounding ready (${grounding.length} chars) but no ELLINEA_LLM_API_KEY / OPENAI_API_KEY is configured. Use the template engine answer.`;
  void notifyUser(ragAnswer, 'rag_template');
  return json({
    answer: ragAnswer,
    mode: 'rag_template',
    groundingChars: grounding.length,
  });
};
