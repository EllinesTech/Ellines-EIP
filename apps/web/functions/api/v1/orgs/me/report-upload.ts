/**
 * Pages Function: POST /api/v1/orgs/me/report-upload
 *
 * Owner/IT upload a report file (CSV, Excel JSON extract, or plain text/PDF text)
 * directly into the Document Hub. Ellinea auto-interprets on upload.
 *
 * Body (JSON):
 *   name: string         — display name for the file
 *   mimeType: string     — e.g. "text/csv", "application/vnd.ms-excel", "application/pdf"
 *   content: string      — base64-encoded file content (≤ 500 KB)
 *   textContent?: string — pre-extracted plain text (for PDF — client extracts, sends here)
 *   branch?: string
 *   department?: string
 *   tags?: string[]
 *
 * Stores in Document Hub and runs Ellinea interpret (summarize) on the text content.
 * Returns the DocumentRecord with an `ellineaSummary` field.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

interface EnvWithLLM extends Env {
  ELLINEA_LLM_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ELLINEA_LLM_BASE_URL?: string;
  ELLINEA_LLM_MODEL?: string;
}

const MAX_DOC_BYTES = 500 * 1024;
const MAX_DOCS = 50;

function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function cuid(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Extract readable text from base64 content for Ellinea interpretation. */
function extractTextFromContent(content: string, mimeType: string): string {
  try {
    const decoded = atob(content.replace(/^data:[^;]+;base64,/, ''));
    // For CSV / plain text, the decoded string is the content
    if (
      mimeType.includes('csv') ||
      mimeType.includes('text') ||
      mimeType.includes('plain')
    ) {
      return decoded.slice(0, 4000);
    }
    // For JSON/Excel-json, try parse
    if (mimeType.includes('json')) {
      try {
        const parsed = JSON.parse(decoded);
        return JSON.stringify(parsed, null, 2).slice(0, 4000);
      } catch {
        return decoded.slice(0, 4000);
      }
    }
    // Binary (Excel, PDF) — return a note; client should pre-extract text
    return decoded.replace(/[^\x20-\x7E\n\r\t]/g, ' ').slice(0, 2000);
  } catch {
    return '';
  }
}

async function ellineaSummarize(
  env: EnvWithLLM,
  fileName: string,
  textContent: string,
): Promise<string | null> {
  const apiKey = env.ELLINEA_LLM_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey || !textContent.trim()) return null;
  const base = (env.ELLINEA_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.ELLINEA_LLM_MODEL || 'gpt-4o-mini';
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content:
              'You are Ellinea AI for Ellines EIP. Summarize the uploaded report concisely for an enterprise executive. Extract: key metrics, notable figures, dates, trends, and any anomalies. 3–5 sentences max.',
          },
          {
            role: 'user',
            content: `Report file: ${fileName}\n\nContent:\n${textContent.slice(0, 3000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function templateSummary(fileName: string, textContent: string): string {
  const lines = textContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const preview = lines.slice(0, 5).join(' | ');
  const rows = lines.length;
  return `${fileName}: ${rows} data row${rows !== 1 ? 's' : ''}. Preview: ${preview.slice(0, 200)}.`;
}

export const onRequest: PagesFunction<EnvWithLLM> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  let body: {
    name?: string;
    mimeType?: string;
    content?: string;
    textContent?: string;
    branch?: string;
    department?: string;
    tags?: string[];
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const name = (body.name || '').trim();
  if (!name) return json({ statusCode: 400, message: 'name is required' }, 400);

  const mimeType = (body.mimeType || 'text/plain').trim();
  const content = (body.content || '').trim();
  if (!content) return json({ statusCode: 400, message: 'content (base64) is required' }, 400);

  // Size check (base64 is ~4/3 of binary size)
  const estimatedBytes = Math.ceil((content.length * 3) / 4);
  if (estimatedBytes > MAX_DOC_BYTES) {
    return json(
      { statusCode: 413, message: `File too large — maximum ${MAX_DOC_BYTES / 1024} KB` },
      413,
    );
  }

  const supabase = getAdminClient(context.env);

  // Load existing documents
  const { data: org, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(org?.settings);
  const docs = Array.isArray(settings.documents)
    ? (settings.documents as Record<string, unknown>[])
    : [];

  if (docs.length >= MAX_DOCS) {
    return json(
      { statusCode: 422, message: `Document limit reached (${MAX_DOCS}). Delete some first.` },
      422,
    );
  }

  // Extract text for Ellinea
  const textContent =
    typeof body.textContent === 'string' && body.textContent.trim()
      ? body.textContent.trim()
      : extractTextFromContent(content, mimeType);

  // Run Ellinea summarize (LLM if available, template fallback)
  const llmSummary = await ellineaSummarize(context.env, name, textContent);
  const ellineaSummary = llmSummary ?? templateSummary(name, textContent);

  const now = new Date().toISOString();
  const docRecord = {
    id: cuid(),
    name,
    mimeType,
    sizeBytes: estimatedBytes,
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 8).map(String) : [],
    branch: typeof body.branch === 'string' ? body.branch.trim() : undefined,
    department: typeof body.department === 'string' ? body.department.trim() : undefined,
    summary: ellineaSummary,
    uploadedBy: auth.email,
    uploadedAt: now,
    content, // stored server-side, stripped on list
  };

  const nextDocs = [{ ...docRecord }, ...docs].slice(0, MAX_DOCS);
  const nextSettings = { ...settings, documents: nextDocs };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: now })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'document.upload',
    resource: 'document',
    metadata: { id: docRecord.id, name, mimeType, sizeBytes: estimatedBytes },
    created_at: now,
  });

  // Return without `content` field
  const { content: _c, ...safeDoc } = docRecord;
  return json({ ...safeDoc, ellineaSummary, mode: llmSummary ? 'llm' : 'template' });
};
