import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../shared/auth';
import { sendOutboundEmail } from '../../../shared/mail';
import { checkRateLimit, rateLimitResponse } from '../../../shared/rate-limit';

// ─── Model orchestrator response shape ────────────────────────────────────────
// Mirrors OrchestrateResponse from ellinea.controller.ts (services/identity).

type ModelDecision = {
  modelId: string;
  confidence: number;
  weight: number;
};

type OrchestrateResponse = {
  answer: string;
  confidence: number;
  explanation: string;
  sources: string[];
  modelDecisions: ModelDecision[];
  conflictDetected: boolean;
  ensembleStrategy: 'weighted_vote' | 'meta_learning';
  queryType: string;
  routingReason: string;
  degradationNotice?: string;
};

/**
 * Call the internal POST /api/v1/ellinea/orchestrate endpoint on the identity
 * service (Cloudflare Pages Functions co-deployed on the same origin).
 *
 * Returns null if the endpoint is unreachable or returns a non-OK status —
 * the caller falls back to the direct LLM path in that case.
 *
 * Requirement 1.2: Route query to the most appropriate model.
 * Requirement 1.8: Include modelDecisions in the response for audit.
 */
async function callOrchestrate(
  request: Request,
  jwtToken: string,
  query: string,
  orgId: string,
): Promise<OrchestrateResponse | null> {
  // Derive the internal API base from the incoming request origin so this
  // works in both local dev and on Cloudflare Pages without any hard-coded URL.
  const url = new URL(request.url);
  const internalBase = `${url.protocol}//${url.host}`;

  let res: Response;
  try {
    res = await fetch(`${internalBase}/api/v1/ellinea/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ query, orgId }),
    });
  } catch {
    // Network failure — fall through to direct LLM path.
    return null;
  }

  if (!res.ok) return null;

  try {
    return (await res.json()) as OrchestrateResponse;
  } catch {
    return null;
  }
}

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

// ─── Document-request keyword detection (Task 13.4) ──────────────────────────
// If the user's question contains document-generation intent keywords, the
// response is augmented with `documentAction` and `documentHint` fields so
// the client can surface a "Generate document" affordance.  This is purely
// additive — no existing behaviour is altered.

const DOCUMENT_KEYWORDS = [
  'generate',
  'report',
  'excel',
  'pdf',
  'word',
  'download',
  'spreadsheet',
];

function detectDocumentRequest(question: string): boolean {
  const lower = question.toLowerCase();
  return DOCUMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function documentHintFields(question: string): Record<string, string> {
  if (!detectDocumentRequest(question)) return {};
  return {
    documentAction: 'generate_report',
    documentHint:
      'Use /api/v1/orgs/:slug/documents/generate to create this document',
  };
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
    // 20.1: multi-turn conversation support
    conversationId?: string;
    // 24.2: user challenge / re-evaluation (boolean or object with challenge details)
    challenge?: unknown;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const permissionError = await requirePermissionAsync(context.env, auth.sub, auth.organizationId, auth.role, 'ellinea:ask');
  if (permissionError) return permissionError;
  const rate = await checkRateLimit(context.env, auth.organizationId, auth.sub, '/api/v1/ellinea/ask', 'POST');
  if (!rate.allowed) return rateLimitResponse(rate.remaining, rate.reset.getTime());

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question.length < 2) {
    return json({ statusCode: 400, message: 'question is required' }, 400);
  }

  // 20.1: Extract conversationId to pass through for multi-turn history tracking
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() || undefined : undefined;

  // 24.2: User challenge flag — re-evaluate with higher scrutiny (boolean true OR challenge object)
  const isChallenge = body.challenge === true || (body.challenge !== null && typeof body.challenge === 'object');

  const supabase = getAdminClient(context.env);
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (!org) return json({ statusCode: 404, message: 'Organization not found' }, 404);
  const settings = org.settings && typeof org.settings === 'object' && !Array.isArray(org.settings)
    ? (org.settings as Record<string, unknown>) : {};
  const serverMemory = normalizeNotes(settings.ellineaMemory);
  const { data: snapshot } = await supabase
    .from('enterprise_snapshots')
    .select('connector_name, health_score, open_alerts, open_decisions, brief_highlight, timeline')
    .eq('organization_id', auth.organizationId)
    .maybeSingle();
  const serverSummary = snapshot ? {
    status: 'synced', connectorName: snapshot.connector_name, healthScore: snapshot.health_score,
    openAlerts: snapshot.open_alerts, openDecisions: snapshot.open_decisions,
    briefHighlight: snapshot.brief_highlight, timeline: snapshot.timeline,
  } : null;
  const memory = serverMemory;
  const dna = null;
  const role = auth.role;
  const organizationName = org.name;

  const actorEmail = auth.email;

  const grounding = buildGrounding({
    question,
    summary: serverSummary,
    memory,
    dna,
    role,
    organizationName,
  });

  // 20.3: HR/operations grounding note — HR queries are supported by Ellinea.
  // HR-related keywords detected in the question trigger an additional grounding hint.
  const HR_KEYWORDS = ['employee', 'hr', 'payroll', 'leave', 'staff', 'headcount', 'recruitment', 'onboard', 'offboard', 'workforce', 'attendance', 'performance review'];
  const lowerQ = question.toLowerCase();
  const isHrQuery = HR_KEYWORDS.some(kw => lowerQ.includes(kw));
  const hrGrounding = isHrQuery
    ? '\n[hr] HR and workforce operations queries are supported. Employee data, payroll summaries, and leave balances should be sourced from the connected HRM/ERP connector snapshot.'
    : '';

  // 24.2: Challenge re-evaluation — append scrutiny instruction
  const challengeGrounding = isChallenge
    ? '\n[challenge] User challenged this answer. Re-evaluating with higher scrutiny. Double-check every claim against grounding sources before responding.'
    : '';

  // 24.2: User challenge support — when challenge is an object, include its content
  let challengeObjectGrounding = '';
  if (body.challenge && typeof body.challenge === 'object') {
    const challengeText = JSON.stringify(body.challenge).slice(0, 200);
    challengeObjectGrounding = `\n[challenge] User challenges the previous answer: ${challengeText}`;
  }

  const effectiveGrounding = grounding + hrGrounding + challengeGrounding + challengeObjectGrounding;

  // 20.2: Derive relatedQuestions from the query type for cross-system follow-up suggestions
  function deriveRelatedQuestions(q: string, qt?: string): string[] {
    const lower = q.toLowerCase();
    if (lower.includes('connector') || lower.includes('sync') || qt === 'connector') {
      return ['What connectors have failed in the last 24 hours?', 'Which connector has the lowest health score?', 'How do I fix a connector sync error?'];
    }
    if (lower.includes('alert') || lower.includes('risk') || qt === 'alert') {
      return ['What is causing the most alerts right now?', 'Which alerts require immediate attention?', 'How do I resolve a critical alert?'];
    }
    if (lower.includes('user') || lower.includes('access') || qt === 'access') {
      return ['Which users have admin access?', 'Are there any inactive users with open permissions?', 'How do I revoke access for a departed employee?'];
    }
    if (lower.includes('health') || lower.includes('score') || qt === 'health') {
      return ['What is driving the current health score?', 'Which system has the lowest health?', 'What actions would most improve the health score?'];
    }
    if (isHrQuery) {
      return ['What is the current headcount?', 'Are there any pending leave requests?', 'Which department has the highest staff turnover?'];
    }
    return ['What is the current enterprise health score?', 'Are there any open decisions requiring approval?', 'Which connectors are currently active?'];
  }

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

  // ── Step 1: Call model orchestrator for routing metadata (Requirement 1.8) ──
  // Extract the JWT from the Authorization header so we can forward it to the
  // internal orchestrate endpoint on the same origin.
  const jwtToken = (context.request.headers.get('authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  let orchestration: OrchestrateResponse | null = null;
  if (jwtToken) {
    orchestration = await callOrchestrate(
      context.request,
      jwtToken,
      question,
      auth.organizationId,
    );
  }

  // Pull the audit fields we want to surface; fall back to safe defaults so
  // the response shape is stable whether or not the orchestrator is reachable.
  const modelDecisions = orchestration?.modelDecisions ?? [];
  const queryType      = orchestration?.queryType      ?? undefined;
  const routingReason  = orchestration?.routingReason  ?? undefined;

  const relatedQuestions = deriveRelatedQuestions(question, queryType);

  try {
    const llm = await callLlm(context.env, question, effectiveGrounding, role);
    if (llm) {
      void notifyUser(llm.answer, `llm:${llm.provider}`);
      return json({
        answer: llm.answer,
        mode: 'llm',
        provider: llm.provider,
        groundingChars: effectiveGrounding.length,
        // 24.1: structured explanation from orchestration pipeline
        explanation: orchestration?.explanation ?? '',
        // Requirement 1.8: include model selection audit trail
        modelDecisions,
        ...(queryType       ? { queryType }       : {}),
        ...(routingReason   ? { routingReason }   : {}),
        // 20.1: echo conversationId for client-side history tracking
        ...(conversationId  ? { conversationId }  : {}),
        // 20.2: related follow-on questions
        relatedQuestions,
        ...documentHintFields(question),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LLM failed';
    const fallbackAnswer = `Ellinea could not reach the LLM provider (${message}). No live model answer is available.`;
    void notifyUser(fallbackAnswer, 'error');
    return json(
      {
        answer: fallbackAnswer,
        mode: 'error',
        error: message,
        groundingChars: effectiveGrounding.length,
        // 24.1: structured explanation
        explanation: orchestration?.explanation ?? '',
        modelDecisions,
        ...(queryType       ? { queryType }       : {}),
        ...(routingReason   ? { routingReason }   : {}),
        ...(conversationId  ? { conversationId }  : {}),
        relatedQuestions,
        ...documentHintFields(question),
      },
      200,
    );
  }

  const ragAnswer = `RAG grounding ready (${effectiveGrounding.length} chars) but no ELLINEA_LLM_API_KEY / OPENAI_API_KEY is configured. No generated answer is available.`;
  void notifyUser(ragAnswer, 'rag_template');
  return json({
    answer: ragAnswer,
    mode: 'rag_template',
    groundingChars: effectiveGrounding.length,
    // 24.1: structured explanation
    explanation: orchestration?.explanation ?? '',
    modelDecisions,
    ...(queryType       ? { queryType }       : {}),
    ...(routingReason   ? { routingReason }   : {}),
    ...(conversationId  ? { conversationId }  : {}),
    relatedQuestions,
    ...documentHintFields(question),
  });
};
