/**
 * Pages Function: GET /api/v1/orgs/me/agent-templates
 *
 * Returns published agent templates for the gallery.
 * Featured templates appear first. Owner/IT Admin only.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

// Bundled templates — served without a separate DB round-trip.
// The NestJS identity service also has these via AgentTemplate Prisma model.
const AGENT_TEMPLATES = [
  {
    id: 'tpl_auto_approve',
    slug: 'auto-approve-low-value',
    name: 'Auto-approve Low-value Requests',
    description:
      'Automatically approve approval requests below a configurable monetary threshold. High-confidence approvals execute without human review.',
    category: 'approval',
    trigger: 'approval_pending',
    triggerConfig: { eventType: 'approval_created' },
    condition: { field: 'amount', op: 'lt', value: 500 },
    action: { type: 'auto_approve', notifyRequester: true },
    confidenceThreshold: 0.85,
    requireApproval: false,
    published: true,
    featured: true,
    installCount: 0,
  },
  {
    id: 'tpl_escalate',
    slug: 'escalate-stuck-approvals',
    name: 'Escalate Stuck Approvals',
    description:
      'Monitor pending approvals and escalate to the Owner when waiting more than 3 days. Keeps decisions moving without manual follow-up.',
    category: 'approval',
    trigger: 'approval_pending',
    triggerConfig: { eventType: 'approval_overdue', daysThreshold: 3 },
    condition: { field: 'daysOpen', op: 'gte', value: 3 },
    action: { type: 'escalate', target: 'owner', notifyStakeholders: true },
    confidenceThreshold: 0.9,
    requireApproval: false,
    published: true,
    featured: true,
    installCount: 0,
  },
  {
    id: 'tpl_reorder',
    slug: 'reorder-alert',
    name: 'Reorder Low-stock Items',
    description:
      'Trigger a reorder workflow when inventory drops below threshold. Integrates with connected ERP or inventory Systems of Record.',
    category: 'workflow',
    trigger: 'alert_threshold',
    triggerConfig: { alertType: 'inventory_low' },
    condition: { field: 'stockLevel', op: 'lt', value: 20 },
    action: { type: 'reorder', quantityMultiplier: 2, notifyIT: true },
    confidenceThreshold: 0.75,
    requireApproval: true,
    published: true,
    featured: false,
    installCount: 0,
  },
  {
    id: 'tpl_campaign',
    slug: 'campaign-trigger',
    name: 'Campaign Activation Trigger',
    description:
      'Auto-activate a marketing campaign when CRM lead count crosses a threshold. Connects to HubSpot, Salesforce, or any CRM connector.',
    category: 'workflow',
    trigger: 'sync_complete',
    triggerConfig: { connectorCategory: 'CRM' },
    condition: { field: 'newLeads', op: 'gte', value: 50 },
    action: { type: 'campaign', campaignType: 'email_outreach', notifyOwner: true },
    confidenceThreshold: 0.7,
    requireApproval: true,
    published: true,
    featured: false,
    installCount: 0,
  },
];

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  // Try to load install counts from org settings
  let templates = AGENT_TEMPLATES;
  try {
    const supabase = getAdminClient(context.env);
    const { data } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();

    const settings = asObj(data?.settings);
    const installedSlugs = new Set<string>(
      (normalizeAgents(settings.ellineaAgents) as { templateId?: string | null }[])
        .map((a) => a.templateId)
        .filter((s): s is string => typeof s === 'string'),
    );

    templates = AGENT_TEMPLATES.map((t) => ({
      ...t,
      installed: installedSlugs.has(t.slug),
    })) as typeof AGENT_TEMPLATES;
  } catch {
    // Return templates without install counts on error
  }

  // Featured first
  templates.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  return json(templates);
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalizeAgents(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw;
}
