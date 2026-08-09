/**
 * Pages Function: POST /api/v1/orgs/me/alert-root-cause
 *
 * Root-cause recommendation (A.3.2).
 * Accepts correlation groups + enterprise snapshot, uses Ellinea Ask to
 * generate a concise root-cause diagnosis and recommended actions.
 *
 * If no LLM is configured, returns a template-based recommendation instead.
 *
 * Owner/IT Admin only.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>) : {};
}

type CorrelationGroup = {
  id: string;
  category: string;
  severity: string;
  count: number;
  sources: string[];
  rootCauseHint: string;
  suggestedActions: string[];
};

// Template-based root cause (no LLM needed)
function templateRootCause(groups: CorrelationGroup[], orgName: string): string {
  if (!groups.length) return 'No alert clusters detected in the last 24 hours.';

  const critical = groups.filter((g) => g.severity === 'critical');
  const high = groups.filter((g) => g.severity === 'high');
  const topGroup = groups[0];

  const lines: string[] = [];

  if (critical.length) {
    lines.push(
      `CRITICAL: ${critical.length} critical alert cluster(s) require immediate attention — ` +
      critical.map((g) => `${g.count}× ${g.category.replace(/_/g, ' ')}`).join(', ') + '.',
    );
  }

  if (high.length) {
    lines.push(
      `HIGH: ${high.length} high-severity group(s) detected — ` +
      high.map((g) => `${g.count}× ${g.category.replace(/_/g, ' ')}`).join(', ') + '.',
    );
  }

  lines.push(`Top cluster: ${topGroup.rootCauseHint}`);
  lines.push(`Suggested: ${topGroup.suggestedActions.slice(0, 2).join(' · ')}.`);

  if (groups.length > 1) {
    lines.push(
      `Other groups: ${groups
        .slice(1, 4)
        .map((g) => `${g.count}× ${g.category.replace(/_/g, ' ')} (${g.severity})`)
        .join('; ')}.`,
    );
  }

  return lines.join('\n');
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  let body: { correlationGroups?: CorrelationGroup[]; orgName?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const groups = body.correlationGroups || [];
  const orgName = body.orgName || 'your organisation';

  // Always produce the template recommendation (instant, no LLM cost)
  const templateAnswer = templateRootCause(groups, orgName);

  // Try to use Ellinea Ask for an LLM-enhanced recommendation if available
  const supabase = getAdminClient(context.env);
  const { data: orgData } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  const settings = asObj(orgData?.settings || {});
  const ellineaSettings = asObj(settings.ellineaSettings || {});
  const llmEnabled = Boolean(ellineaSettings.llmEnabled);
  const openAiKey = (context.env as unknown as Record<string, string>)['OPENAI_API_KEY'];

  let recommendation = templateAnswer;
  let mode: 'template' | 'llm' = 'template';

  if (llmEnabled && openAiKey) {
    try {
      const question =
        `Analyse these enterprise alert correlations for ${orgName} and provide a concise root-cause diagnosis (3-5 sentences) and top 3 recommended actions:\n\n` +
        groups
          .slice(0, 5)
          .map((g) => `- ${g.severity.toUpperCase()} | ${g.count}× ${g.category} | Hint: ${g.rootCauseHint}`)
          .join('\n');

      const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content:
                'You are Ellinea AI, the intelligence layer of Ellines EIP. ' +
                'You diagnose enterprise alert patterns and recommend actions for IT administrators. ' +
                'Be direct, technical, and concise. Never invent data not in the prompt.',
            },
            { role: 'user', content: question },
          ],
        }),
      });

      if (llmRes.ok) {
        const llmData = (await llmRes.json()) as { choices?: { message?: { content?: string } }[] };
        const content = llmData.choices?.[0]?.message?.content;
        if (content) {
          recommendation = content;
          mode = 'llm';
        }
      }
    } catch {
      // Fall through to template answer on LLM failure
    }
  }

  // Cache the recommendation in org settings
  const nextSettings = {
    ...settings,
    lastAlertRootCause: {
      recommendation,
      mode,
      groupCount: groups.length,
      computedAt: new Date().toISOString(),
    },
  };

  await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);

  return json({
    recommendation,
    mode,
    groupCount: groups.length,
    computedAt: new Date().toISOString(),
  });
};
