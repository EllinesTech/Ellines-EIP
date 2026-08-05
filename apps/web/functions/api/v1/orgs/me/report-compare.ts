/**
 * Pages Function: POST /api/v1/orgs/me/report-compare
 *
 * Ellinea compares two reports side-by-side — delta detection, improvements,
 * declines, and a natural-language narrative. Template mode works without LLM;
 * richer with an OpenAI-compatible key configured.
 *
 * EIP observes SoR data. It never writes back to the originating system.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

interface EnvWithLLM extends Env {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
}

async function callLLM(
  env: EnvWithLLM,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const apiKey = env.OPENAI_API_KEY || env.ELLINEA_LLM_API_KEY;
  if (!apiKey) return null;
  const baseUrl = env.OPENAI_BASE_URL || env.ELLINEA_LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = env.OPENAI_MODEL || env.ELLINEA_LLM_MODEL || 'gpt-4o-mini';
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 900,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/[\d,]+(\.\d+)?/g);
  return (matches ?? [])
    .map((s) => parseFloat(s.replace(/,/g, '')))
    .filter((n) => !isNaN(n) && isFinite(n));
}

function templateComparison(opts: {
  titleA: string;
  titleB: string;
  contentA: string;
  contentB: string;
  dateA: string;
  dateB: string;
  orgName: string;
}): string {
  const { titleA, titleB, contentA, contentB, dateA, dateB, orgName } = opts;

  const numsA = extractNumbers(contentA);
  const numsB = extractNumbers(contentB);
  const lines: string[] = [];

  lines.push(`✦ Ellinea Report Comparison — ${orgName}`);
  lines.push('');
  lines.push(`Report A: ${titleA}  (${new Date(dateA).toLocaleDateString()})`);
  lines.push(`Report B: ${titleB}  (${new Date(dateB).toLocaleDateString()})`);
  lines.push('');

  // Numeric delta section
  const comparable = Math.min(numsA.length, numsB.length, 8);
  const deltas: { a: number; b: number; delta: number; pct: string }[] = [];
  for (let i = 0; i < comparable; i++) {
    const delta = numsB[i] - numsA[i];
    if (Math.abs(delta) > 0.005) {
      const pct = numsA[i] !== 0
        ? `${delta > 0 ? '+' : ''}${((delta / Math.abs(numsA[i])) * 100).toFixed(1)}%`
        : delta > 0 ? '+∞' : '-∞';
      deltas.push({ a: numsA[i], b: numsB[i], delta, pct });
    }
  }

  if (deltas.length > 0) {
    lines.push('Key figure deltas:');
    const improvements = deltas.filter((d) => d.delta > 0);
    const declines = deltas.filter((d) => d.delta < 0);
    if (improvements.length) {
      lines.push(`  ↑ Improvements (${improvements.length}):`);
      improvements.forEach((d) => {
        lines.push(`    • ${d.a.toLocaleString()} → ${d.b.toLocaleString()} (${d.pct})`);
      });
    }
    if (declines.length) {
      lines.push(`  ↓ Declines (${declines.length}):`);
      declines.forEach((d) => {
        lines.push(`    • ${d.a.toLocaleString()} → ${d.b.toLocaleString()} (${d.pct})`);
      });
    }
  } else if (numsA.length === 0 && numsB.length === 0) {
    lines.push('No numeric data detected in either report.');
  } else {
    lines.push('No significant numeric deltas found between the two reports.');
  }

  // New / removed keyword signals
  const wordsA = new Set(
    contentA.toLowerCase().match(/\b[a-z]{5,}\b/g)?.filter((w) => !/^(which|where|their|there|would|should|could|about|after|before)$/.test(w)) ?? [],
  );
  const wordsB = new Set(
    contentB.toLowerCase().match(/\b[a-z]{5,}\b/g)?.filter((w) => !/^(which|where|their|there|would|should|could|about|after|before)$/.test(w)) ?? [],
  );
  const newTopics = [...wordsB].filter((w) => !wordsA.has(w)).slice(0, 6);
  const removedTopics = [...wordsA].filter((w) => !wordsB.has(w)).slice(0, 6);

  if (newTopics.length || removedTopics.length) {
    lines.push('');
    lines.push('Content signals:');
    if (newTopics.length) lines.push(`  + New topics in Report B: ${newTopics.join(', ')}`);
    if (removedTopics.length) lines.push(`  − Topics absent from Report B: ${removedTopics.join(', ')}`);
  }

  // Overall narrative
  lines.push('');
  lines.push('Ellinea narrative:');
  const sizeRatio = contentB.length / (contentA.length || 1);
  if (sizeRatio > 1.25) {
    lines.push('  Report B is significantly more detailed than Report A — new sections or metrics added.');
  } else if (sizeRatio < 0.75) {
    lines.push('  Report B is more concise than Report A — some data may have been summarised or removed.');
  } else {
    lines.push('  Both reports are comparable in scope and length.');
  }

  const improvements2 = deltas.filter((d) => d.delta > 0);
  const declines2 = deltas.filter((d) => d.delta < 0);
  if (improvements2.length > declines2.length) {
    lines.push('  Overall trend: more figures improved than declined — positive movement.');
  } else if (declines2.length > improvements2.length) {
    lines.push('  Overall trend: more figures declined than improved — warrants attention.');
  } else if (deltas.length > 0) {
    lines.push('  Overall trend: mixed signals — some figures up, some down.');
  }

  lines.push('');
  lines.push('_Template analysis. Enable LLM in Settings → Ellinea AI for deeper insight._');
  return lines.join('\n');
}

export const onRequest: PagesFunction<EnvWithLLM> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: {
    reportAId?: string;
    reportBId?: string;
    titleA?: string;
    titleB?: string;
    contentA?: string;
    contentB?: string;
    dateA?: string;
    dateB?: string;
    orgName?: string;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const reportAId = (body.reportAId || 'a').slice(0, 64);
  const reportBId = (body.reportBId || 'b').slice(0, 64);
  const titleA = (body.titleA || 'Report A').slice(0, 200);
  const titleB = (body.titleB || 'Report B').slice(0, 200);
  const contentA = (body.contentA || '').slice(0, 8000);
  const contentB = (body.contentB || '').slice(0, 8000);
  const dateA = body.dateA || new Date().toISOString();
  const dateB = body.dateB || new Date().toISOString();
  const orgName = (body.orgName || 'Organisation').slice(0, 100);

  if (!contentA.trim() || !contentB.trim()) {
    return json({ statusCode: 400, message: 'contentA and contentB are required' }, 400);
  }

  // Try LLM
  const systemPrompt =
    `You are Ellinea AI, the enterprise intelligence engine for ${orgName}. ` +
    `Compare two business reports, identify deltas, improvements, and declines. ` +
    `Structure your output: overall verdict, key improvements, key declines, notable changes, action recommendation. ` +
    `Be concise and data-driven. Never invent data.`;

  const userPrompt =
    `Report A (${titleA}, ${new Date(dateA).toLocaleDateString()}):\n${contentA.slice(0, 3500)}\n\n` +
    `Report B (${titleB}, ${new Date(dateB).toLocaleDateString()}):\n${contentB.slice(0, 3500)}\n\n` +
    `Compare these two reports. What improved? What declined? What is the overall trend? What action should leadership take?`;

  const llmResult = await callLLM(context.env, systemPrompt, userPrompt).catch(() => null);
  const comparison = llmResult || templateComparison({ titleA, titleB, contentA, contentB, dateA, dateB, orgName });
  const mode = llmResult ? 'llm' : 'template';

  // Export HTML
  const exportHtml = buildComparisonHtml({
    titleA, titleB, contentA, contentB, dateA, dateB, orgName, comparison,
  });

  // Audit (fire-and-forget)
  const supabase = getAdminClient(context.env);
  void supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'org_data.report_compare',
    resource: 'report',
    metadata: { reportAId, reportBId, titleA, titleB, mode },
  });

  return json({
    reportAId,
    reportBId,
    titleA,
    titleB,
    comparison,
    exportHtml,
    mode,
    comparedAt: new Date().toISOString(),
  });
};

function buildComparisonHtml(opts: {
  titleA: string;
  titleB: string;
  contentA: string;
  contentB: string;
  dateA: string;
  dateB: string;
  orgName: string;
  comparison: string;
}): string {
  const { titleA, titleB, contentA, contentB, dateA, dateB, orgName, comparison } = opts;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Report Comparison — ${esc(orgName)}</title>
<style>
  body{font-family:'Segoe UI',sans-serif;max-width:1100px;margin:40px auto;padding:0 24px;color:#0f172a;background:#fff}
  .hdr{border-bottom:3px solid #6F2D8D;padding-bottom:16px;margin-bottom:28px}
  .brand{font-size:11px;font-weight:700;color:#6F2D8D;letter-spacing:.1em;text-transform:uppercase}
  h1{margin:8px 0 4px;font-size:22px;font-weight:800}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}
  .panel{border:1px solid #e2e8f0;border-radius:8px;padding:18px}
  .panel h2{font-size:14px;font-weight:700;margin:0 0 4px;color:#6F2D8D}
  .panel .meta{font-size:11px;color:#64748b;margin-bottom:12px}
  .panel pre{font-size:12px;line-height:1.6;white-space:pre-wrap;color:#1e293b;margin:0}
  .analysis{background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:18px;margin:24px 0}
  .analysis h2{font-size:14px;font-weight:700;margin:0 0 12px;color:#6F2D8D}
  .analysis pre{font-size:13px;line-height:1.7;white-space:pre-wrap;color:#1e293b;margin:0}
  .ft{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
  @media print{body{margin:0}}
</style></head><body>
<div class="hdr">
  <div class="brand">Ellines EIP — ${esc(orgName)}</div>
  <h1>Report Comparison</h1>
</div>
<div class="grid">
  <div class="panel">
    <h2>${esc(titleA)}</h2>
    <div class="meta">${new Date(dateA).toLocaleString()}</div>
    <pre>${esc(contentA.slice(0, 2000))}${contentA.length > 2000 ? '\n…(truncated)' : ''}</pre>
  </div>
  <div class="panel">
    <h2>${esc(titleB)}</h2>
    <div class="meta">${new Date(dateB).toLocaleString()}</div>
    <pre>${esc(contentB.slice(0, 2000))}${contentB.length > 2000 ? '\n…(truncated)' : ''}</pre>
  </div>
</div>
<div class="analysis">
  <h2>✦ Ellinea Analysis</h2>
  <pre>${esc(comparison)}</pre>
</div>
<div class="ft">Ellines EIP · Enterprise Intelligence Platform · Where Enterprise Systems Think Together. Generated ${new Date().toLocaleString()}</div>
</body></html>`;
}
