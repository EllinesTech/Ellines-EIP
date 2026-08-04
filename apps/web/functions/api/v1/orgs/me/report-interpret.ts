/**
 * Pages Function: POST /api/v1/orgs/me/report-interpret
 *
 * Ellinea interprets a report's content — summarize, pivot, highlight key figures.
 * Accepts report content + action (summarize | pivot | highlight | compare).
 *
 * EIP observes SoR reports. It never writes to the originating system.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

interface EnvWithOpenAI extends Env {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
}

async function callLLM(
  env: EnvWithOpenAI,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function templateInterpret(
  title: string,
  content: string,
  action: string,
): string {
  const preview = content.slice(0, 600);
  switch (action) {
    case 'pivot':
      return (
        `📊 Ellinea Pivot — ${title}\n\n` +
        `Key dimensions detected:\n` +
        `• Time: Review date/period columns for trend analysis\n` +
        `• Categories: Group by product, department, branch, or region\n` +
        `• Metrics: Focus on totals, averages, and percentage changes\n\n` +
        `From content preview:\n${preview}\n\n` +
        `Recommended pivot: Group by category → sort by value → highlight top 3 and bottom 3. ` +
        `Connect an LLM (Settings → Ellinea AI) for AI-driven pivot analysis.`
      );
    case 'highlight':
      return (
        `🔦 Ellinea Key Figures — ${title}\n\n` +
        `Scanning for notable numbers and trends…\n\n` +
        `Content excerpt:\n${preview}\n\n` +
        `To unlock AI-driven highlighting (anomaly detection, outliers, significant changes): ` +
        `configure LLM in Settings → Ellinea AI → LLM / RAG.`
      );
    case 'compare':
      return (
        `📈 Ellinea Comparison — ${title}\n\n` +
        `Comparison mode: run this report again for a different period, then use ` +
        `"Compare reports" in Scheduled Reports to see delta analysis.\n\n` +
        `Current snapshot:\n${preview}\n\n` +
        `Tip: Ask Ellinea directly — "Compare this week's sales to last week" — for instant comparison.`
      );
    default: // summarize
      return (
        `✦ Ellinea Summary — ${title}\n\n` +
        `${preview}\n\n` +
        `---\nThis report covers data from your connected system. ` +
        `Key action: review figures above, flag anomalies to your team, ` +
        `and use Approvals to route decisions. ` +
        `For AI-enhanced summaries, configure LLM in Settings → Ellinea AI.`
      );
  }
}

export const onRequest: PagesFunction<EnvWithOpenAI> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: {
    reportId?: string;
    title?: string;
    content?: string;
    action?: 'summarize' | 'pivot' | 'highlight' | 'compare';
    orgName?: string;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const title = (body.title || 'Report').trim().slice(0, 200);
  const content = (body.content || '').trim().slice(0, 8000);
  const action = (['summarize', 'pivot', 'highlight', 'compare'] as const).includes(
    body.action as 'summarize',
  )
    ? (body.action as 'summarize' | 'pivot' | 'highlight' | 'compare')
    : 'summarize';
  const orgName = (body.orgName || 'Organisation').slice(0, 100);

  if (!content) {
    return json({ statusCode: 400, message: 'content is required' }, 400);
  }

  // Try LLM first
  const systemPrompt =
    `You are Ellinea AI, the enterprise intelligence engine for ${orgName}. ` +
    `You help executives and managers understand business reports. ` +
    `Be concise, structured, and action-oriented. ` +
    `Never invent data — only work with what is provided. ` +
    `Flag any anomalies or items requiring human attention.`;

  const actionLabel: Record<string, string> = {
    summarize: 'Summarize this report in 3–5 bullet points with a final recommendation.',
    pivot: 'Identify the key dimensions, metrics, and suggested pivot groupings in this report. List top findings.',
    highlight: 'Highlight the most important figures, outliers, and notable trends. Flag any anomalies.',
    compare: 'Identify trends or patterns that suggest changes over time. Highlight what improved and what declined.',
  };

  const userPrompt =
    `Report title: ${title}\n\nContent:\n${content}\n\n${actionLabel[action]}`;

  const supabase = getAdminClient(context.env);

  const [llmResult] = await Promise.allSettled([
    callLLM(context.env, systemPrompt, userPrompt),
  ]);

  const llmAnswer =
    llmResult.status === 'fulfilled' && llmResult.value ? llmResult.value : null;

  const interpretation = llmAnswer || templateInterpret(title, content, action);
  const mode = llmAnswer ? 'llm' : 'template';

  // Audit the interpretation request (fire-and-forget)
  void supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'org_data.report_interpret',
    resource: 'report',
    metadata: { reportId: body.reportId, title, action, mode },
  });

  return json({
    interpretation,
    action,
    mode,
    title,
  });
};
