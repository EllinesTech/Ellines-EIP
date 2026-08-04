/**
 * Pages Function: POST /api/v1/orgs/me/ellinea-digest
 *
 * Send the Ellinea AI morning digest email to the authenticated user.
 * Aggregates: snapshot KPIs, open alerts, decisions, top emails, pending
 * approvals, scheduled reports, and an Ellinea brief.
 *
 * Called manually from Settings or by an external scheduler (cron job / agent).
 * The delivery policy `emailDigest` must be enabled or the request body
 * can pass `{ force: true }` to bypass the policy check (for manual send).
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import { resolveMailConfig, sendOutboundEmail } from '../../../../shared/mail';

interface EnvWithLLM extends Env {
  ELLINEA_LLM_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ELLINEA_LLM_BASE_URL?: string;
  ELLINEA_LLM_MODEL?: string;
}

function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

async function buildEllineaBrief(
  env: EnvWithLLM,
  context: {
    orgName: string;
    healthScore: number | null;
    openAlerts: number;
    openDecisions: number;
    briefHighlight: string;
    pendingApprovals: number;
    connectorCount: number;
  },
): Promise<string> {
  const apiKey = env.ELLINEA_LLM_API_KEY || env.OPENAI_API_KEY;
  const template = [
    `Organisation: ${context.orgName}`,
    context.healthScore !== null ? `Health Score: ${context.healthScore}/100` : 'Health Score: not yet synced',
    `Open Alerts: ${context.openAlerts}`,
    `Open Decisions / Approvals: ${context.openDecisions + context.pendingApprovals}`,
    `Connected Systems: ${context.connectorCount}`,
    context.briefHighlight ? `Latest Insight: ${context.briefHighlight}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (!apiKey) return template;

  const base = (env.ELLINEA_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.ELLINEA_LLM_MODEL || 'gpt-4o-mini';

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content:
              'You are Ellinea AI for Ellines EIP. Write a concise 3-sentence morning brief for an enterprise executive. Focus on Watch → Decide → Delegate. Be direct and ops-precise.',
          },
          { role: 'user', content: `Enterprise data:\n${template}` },
        ],
      }),
    });
    if (!res.ok) return template;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || template;
  } catch {
    return template;
  }
}

export const onRequest: PagesFunction<EnvWithLLM> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: { force?: boolean } = {};
  try {
    const text = await context.request.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    // ignore
  }

  const supabase = getAdminClient(context.env);

  // Load org settings + snapshot
  const [orgRes, snapshotRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, settings')
      .eq('id', auth.organizationId)
      .maybeSingle(),
    supabase
      .from('enterprise_snapshots')
      .select('health_score, open_alerts, open_decisions, brief_highlight, connector_name')
      .eq('organization_id', auth.organizationId)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const orgName = (orgRes.data?.name as string) || 'Your Organisation';
  const settings = asObj(orgRes.data?.settings);

  // Check delivery policy unless force=true
  if (!body.force) {
    const policy = asObj(settings.notifyDelivery);
    if (policy.emailDigest !== true) {
      return json({
        statusCode: 422,
        message:
          'Email digest is disabled. Enable it in Settings → Notifications → Delivery policy, or pass force:true.',
      }, 422);
    }
  }

  // Check email provider
  const mailConfig = resolveMailConfig(context.env);
  if (!mailConfig) {
    return json({
      statusCode: 422,
      message:
        'No email provider configured. Set RESEND_API_KEY or SMTP_* on Cloudflare Pages to send the digest.',
    }, 422);
  }

  const snapshot = snapshotRes.data;
  const healthScore = snapshot ? (snapshot.health_score as number | null) : null;
  const openAlerts = snapshot ? Number(snapshot.open_alerts) || 0 : 0;
  const openDecisions = snapshot ? Number(snapshot.open_decisions) || 0 : 0;
  const briefHighlight = snapshot ? (snapshot.brief_highlight as string) || '' : '';
  const connectorName = snapshot ? (snapshot.connector_name as string) || '' : '';

  // Count connectors
  const { count: connectorCount } = await supabase
    .from('connector_installations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', auth.organizationId);

  // Count pending approvals
  const approvals = Array.isArray(settings.workflowApprovals)
    ? (settings.workflowApprovals as { status: string }[]).filter((a) => a.status === 'pending')
    : [];

  // Top emails from email-sync cache
  const emailSyncRaw = settings.emailSyncResult;
  const emailSync =
    emailSyncRaw && typeof emailSyncRaw === 'object' && !Array.isArray(emailSyncRaw)
      ? (emailSyncRaw as {
          emails?: Array<{ subject?: string; from?: string; priority?: string }>;
          urgentCount?: number;
          unreadCount?: number;
        })
      : null;
  const urgentEmails = (emailSync?.emails || [])
    .filter((e) => e.priority === 'high')
    .slice(0, 3);

  // Build Ellinea brief
  const brief = await buildEllineaBrief(context.env, {
    orgName,
    healthScore,
    openAlerts,
    openDecisions,
    briefHighlight,
    pendingApprovals: approvals.length,
    connectorCount: connectorCount ?? 0,
  });

  // Compose email
  const siteUrl = context.request.headers.get('origin') || 'https://eip.ellines.co.ke';
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const lines: string[] = [
    `Good morning — Ellinea AI digest for ${today}`,
    `Organisation: ${orgName}`,
    ``,
    `━━ ENTERPRISE BRIEF ━━`,
    brief,
    ``,
    `━━ KEY METRICS ━━`,
    healthScore !== null ? `• Health Score: ${healthScore}/100` : '• Health Score: sync pending',
    `• Open Alerts: ${openAlerts}`,
    `• Open Decisions (Approvals): ${openDecisions + approvals.length}`,
    `• Connected Systems: ${connectorCount ?? 0}${connectorName ? ` (latest: ${connectorName})` : ''}`,
    ``,
  ];

  if (urgentEmails.length > 0) {
    lines.push(`━━ URGENT EMAILS (${emailSync?.urgentCount ?? urgentEmails.length}) ━━`);
    for (const e of urgentEmails) {
      lines.push(`• ${e.subject || '(no subject)'} — from ${e.from || 'unknown'}`);
    }
    lines.push(``);
  }

  if (approvals.length > 0) {
    lines.push(`━━ PENDING APPROVALS (${approvals.length}) ━━`);
    lines.push(`${approvals.length} approval${approvals.length !== 1 ? 's' : ''} waiting for your decision.`);
    lines.push(`Review: ${siteUrl}/app/approvals`);
    lines.push(``);
  }

  lines.push(`━━ QUICK LINKS ━━`);
  lines.push(`Dashboard: ${siteUrl}/app`);
  lines.push(`Connectors: ${siteUrl}/app/connectors`);
  lines.push(`Org System: ${siteUrl}/app/org-system`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`Ellines EIP — Enterprise Intelligence Platform`);
  lines.push(`Where Enterprise Systems Think Together.`);
  lines.push(`Unsubscribe: Settings → Notifications → Delivery policy → Disable email digest`);

  const result = await sendOutboundEmail(context.env, {
    to: auth.email,
    subject: `Ellinea AI Digest — ${orgName} — ${today}`,
    text: lines.join('\n'),
  });

  // Log to audit + outbox
  const now = new Date().toISOString();
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: result.ok ? 'notify.digest.delivered' : 'notify.digest.failed',
    resource: 'ellinea_digest',
    metadata: {
      to: auth.email,
      provider: result.provider,
      ...(result.ok ? {} : { error: (result as { error: string }).error }),
    },
    created_at: now,
  });

  if (result.ok) {
    return json({
      ok: true,
      message: `Digest delivered via ${result.provider} to ${auth.email}.`,
      provider: result.provider,
    });
  }

  return json(
    {
      ok: false,
      message: `Digest send failed: ${(result as { error: string }).error}`,
      provider: result.provider,
    },
    500,
  );
};
