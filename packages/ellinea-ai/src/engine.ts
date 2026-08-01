import type { EllineaEnterpriseSnapshot } from './types';

export type { EllineaEnterpriseSnapshot };

export type EllineaRecommendation = {
  id: string;
  title: string;
  rationale: string;
  evidence: string[];
  confidence: number;
  priority: 'high' | 'medium' | 'low';
};

export type EllineaMemoryNote = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

const MEMORY_PREFIX = 'eip_ellinea_memory_';

export function memoryStorageKey(organizationId: string) {
  return `${MEMORY_PREFIX}${organizationId}`;
}

export function readEllineaMemory(organizationId: string): EllineaMemoryNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(memoryStorageKey(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EllineaMemoryNote[];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function writeEllineaMemory(organizationId: string, notes: EllineaMemoryNote[]) {
  localStorage.setItem(memoryStorageKey(organizationId), JSON.stringify(notes.slice(0, 40)));
}

export type RecFeedbackVote = 'helpful' | 'dismiss';

export type EllineaRecFeedback = Record<string, { helpful: number; dismiss: number }>;

const FEEDBACK_PREFIX = 'eip_ellinea_rec_feedback_';

export function feedbackStorageKey(organizationId: string) {
  return `${FEEDBACK_PREFIX}${organizationId}`;
}

export function readRecFeedback(organizationId: string): EllineaRecFeedback {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(feedbackStorageKey(organizationId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as EllineaRecFeedback;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeRecFeedback(organizationId: string, feedback: EllineaRecFeedback) {
  localStorage.setItem(feedbackStorageKey(organizationId), JSON.stringify(feedback));
}

export type EnterpriseDnaTrait = {
  id: string;
  label: string;
  detail: string;
  source: 'memory' | 'approval' | 'feedback' | 'role';
};

export type EnterpriseDnaSnapshot = {
  organizationId: string;
  updatedAt: string;
  traits: EnterpriseDnaTrait[];
  summary: string;
};

const DNA_PREFIX = 'eip_ellinea_dna_';

export function dnaStorageKey(organizationId: string) {
  return `${DNA_PREFIX}${organizationId}`;
}

export function readEnterpriseDna(organizationId: string): EnterpriseDnaSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(dnaStorageKey(organizationId));
    if (!raw) return null;
    return JSON.parse(raw) as EnterpriseDnaSnapshot;
  } catch {
    return null;
  }
}

export function writeEnterpriseDna(snapshot: EnterpriseDnaSnapshot) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(dnaStorageKey(snapshot.organizationId), JSON.stringify(snapshot));
}

export type LearningSignal = {
  id: string;
  kind: 'approval_rate' | 'alert_pressure' | 'feedback_bias' | 'memory_depth';
  label: string;
  detail: string;
  weight: number;
};

/** Lightweight outcome signals for continuous learning (local, per org). */
export function buildLearningSignals(input: {
  summary: EllineaEnterpriseSnapshot | null;
  approvals: { status: string }[];
  feedback: EllineaRecFeedback;
  memoryCount: number;
}): LearningSignal[] {
  const signals: LearningSignal[] = [];
  const decided = input.approvals.filter((a) => a.status === 'approved' || a.status === 'rejected');
  const approved = decided.filter((a) => a.status === 'approved').length;
  if (decided.length) {
    const rate = Math.round((approved / decided.length) * 100);
    signals.push({
      id: 'approval_rate',
      kind: 'approval_rate',
      label: `${rate}% approval rate`,
      detail: `${approved} of ${decided.length} decided requests approved — shapes DNA caution.`,
      weight: rate,
    });
  }

  if (input.summary?.status === 'synced') {
    const pressure = input.summary.openAlerts + input.summary.openDecisions;
    signals.push({
      id: 'alert_pressure',
      kind: 'alert_pressure',
      label: `Pressure score ${pressure}`,
      detail: `${input.summary.openAlerts} alerts · ${input.summary.openDecisions} open decisions in latest sync.`,
      weight: pressure,
    });
  }

  const votes = Object.values(input.feedback);
  if (votes.length) {
    const helpful = votes.reduce((a, v) => a + v.helpful, 0);
    const dismiss = votes.reduce((a, v) => a + v.dismiss, 0);
    signals.push({
      id: 'feedback_bias',
      kind: 'feedback_bias',
      label: helpful >= dismiss ? 'Insight-positive org' : 'Selective on insights',
      detail: `Ellinea feedback: ${helpful} helpful · ${dismiss} dismiss.`,
      weight: helpful - dismiss,
    });
  }

  if (input.memoryCount > 0) {
    signals.push({
      id: 'memory_depth',
      kind: 'memory_depth',
      label: `${input.memoryCount} memory note(s)`,
      detail: 'Policies and decisions in Enterprise Memory deepen DNA.',
      weight: input.memoryCount,
    });
  }

  return signals;
}

/** Rebuild Enterprise DNA™ from Memory, Approvals, and recommendation feedback. */
export function rebuildEnterpriseDna(input: {
  organizationId: string;
  organizationName?: string;
  role?: string;
  memory: EllineaMemoryNote[];
  approvals: { title: string; status: string; detail: string }[];
  feedback: EllineaRecFeedback;
}): EnterpriseDnaSnapshot {
  const traits: EnterpriseDnaTrait[] = [];

  for (const note of input.memory.slice(0, 8)) {
    traits.push({
      id: `mem-${note.id}`,
      label: note.title,
      detail: note.body,
      source: 'memory',
    });
  }

  const approved = input.approvals.filter((a) => a.status === 'approved').slice(0, 5);
  const rejected = input.approvals.filter((a) => a.status === 'rejected').slice(0, 3);
  for (const a of approved) {
    traits.push({
      id: `appr-${a.title.slice(0, 24)}`,
      label: `Approves: ${a.title}`,
      detail: a.detail || 'Owner/IT approved this path.',
      source: 'approval',
    });
  }
  for (const a of rejected) {
    traits.push({
      id: `rej-${a.title.slice(0, 24)}`,
      label: `Avoids: ${a.title}`,
      detail: a.detail || 'Previously rejected — treat as sensitive.',
      source: 'approval',
    });
  }

  const helpfulIds = Object.entries(input.feedback)
    .filter(([, v]) => v.helpful > v.dismiss)
    .sort((a, b) => b[1].helpful - a[1].helpful)
    .slice(0, 4);
  for (const [id, v] of helpfulIds) {
    traits.push({
      id: `fb-${id}`,
      label: `Values insight type “${id}”`,
      detail: `Marked helpful ${v.helpful}× — prioritize similar recommendations.`,
      source: 'feedback',
    });
  }

  if (input.role === 'owner') {
    traits.push({
      id: 'role-owner',
      label: 'Owner-led authority',
      detail: 'IT grants and org-wide risk sit with the Organization Owner.',
      source: 'role',
    });
  } else if (input.role === 'admin') {
    traits.push({
      id: 'role-admin',
      label: 'IT Admin hygiene',
      detail: 'Connectors, sync health, and work-role access are primary.',
      source: 'role',
    });
  }

  const org = input.organizationName || 'This organization';
  const summary = traits.length
    ? `${org} DNA — ${traits.length} trait(s): ${traits
        .slice(0, 3)
        .map((t) => t.label)
        .join('; ')}${traits.length > 3 ? '…' : ''}.`
    : `${org} DNA is still forming. Add Memory notes, decide Approvals, and mark Ellinea insights helpful.`;

  const snapshot: EnterpriseDnaSnapshot = {
    organizationId: input.organizationId,
    updatedAt: new Date().toISOString(),
    traits: traits.slice(0, 20),
    summary,
  };
  writeEnterpriseDna(snapshot);
  return snapshot;
}

export function recordRecFeedback(
  organizationId: string,
  recId: string,
  vote: RecFeedbackVote,
): EllineaRecFeedback {
  const next = { ...readRecFeedback(organizationId) };
  const cur = next[recId] || { helpful: 0, dismiss: 0 };
  next[recId] = {
    helpful: cur.helpful + (vote === 'helpful' ? 1 : 0),
    dismiss: cur.dismiss + (vote === 'dismiss' ? 1 : 0),
  };
  writeRecFeedback(organizationId, next);
  return next;
}

export function rankRecommendations(
  items: EllineaRecommendation[],
  feedback: EllineaRecFeedback,
): EllineaRecommendation[] {
  const scored = items
    .map((r) => {
      const f = feedback[r.id] || { helpful: 0, dismiss: 0 };
      const boost = f.helpful * 8 - f.dismiss * 12;
      return {
        ...r,
        confidence: Math.max(35, Math.min(98, r.confidence + boost)),
        _score: r.confidence + boost - (r.priority === 'high' ? 0 : r.priority === 'medium' ? 4 : 10),
      };
    })
    .filter((r) => {
      const f = feedback[r.id];
      return !(f && f.dismiss >= 2 && f.helpful === 0);
    })
    .sort((a, b) => b._score - a._score);

  return scored.map(({ _score: _ignored, ...r }) => r);
}

export type EllineaContext = {
  role?: string;
  fullName?: string;
  organizationName?: string;
  memory?: EllineaMemoryNote[];
  useMemory?: boolean;
  useRoleContext?: boolean;
  dna?: EnterpriseDnaSnapshot | null;
  useDna?: boolean;
  /** Optional continuous-learning signals to weight multi-hop answers. */
  learningSignals?: LearningSignal[];
};

type RoleLens = {
  audience: string;
  focus: string;
  actionVerb: string;
  authority: 'owner' | 'it' | 'exec' | 'manager' | 'member' | 'viewer';
  recFilter?: (id: string) => boolean;
};

function roleLens(role: string | undefined): RoleLens {
  switch (role) {
    case 'owner':
      return {
        audience: 'as Organization Owner',
        focus: 'org-wide risk, IT grants, Approvals, and authority to decide — not day-to-day ticket churn',
        actionVerb: 'Decide or escalate to IT with a clear owner call',
        authority: 'owner',
        recFilter: () => true,
      };
    case 'admin':
      return {
        audience: 'as IT Admin',
        focus: 'connector sync health, access hygiene, and systems that wrap SoR without replacing them',
        actionVerb: 'Fix sync/access, then brief Owner on residual risk',
        authority: 'it',
        recFilter: (id) => id !== 'steady',
      };
    case 'executive':
      return {
        audience: 'for the executive view',
        focus: 'health score, cross-branch alerts, and decisions that need Owner/IT air cover',
        actionVerb: 'Watch KPIs and delegate ops follow-through',
        authority: 'exec',
        recFilter: (id) => id !== 'baseline',
      };
    case 'manager':
      return {
        audience: 'for your management lane',
        focus: 'branch attention objects, open tasks, and decisions in your span of control',
        actionVerb: 'Clear lane tasks; escalate org-wide risk to Owner/IT',
        authority: 'manager',
        recFilter: (id) =>
          id === 'decisions' || id === 'attention-objects' || id === 'alerts' || id === 'health',
      };
    case 'viewer':
      return {
        audience: 'in read-only mode',
        focus: 'status and brief highlights (no write actions; no Approvals)',
        actionVerb: 'Observe and route findings to an authorized role',
        authority: 'viewer',
        recFilter: (id) => id === 'steady' || id === 'health' || id === 'alerts',
      };
    default:
      return {
        audience: 'for your work role',
        focus: 'open alerts, assigned tasks, and the daily brief — escalate authority issues to Owner/IT',
        actionVerb: 'Act in-lane; escalate SoR or access changes to IT',
        authority: 'member',
        recFilter: (id) => id !== 'baseline',
      };
  }
}

function dnaAvoidLabels(dna?: EnterpriseDnaSnapshot | null): string[] {
  return (dna?.traits || [])
    .filter((t) => t.source === 'approval' && t.label.toLowerCase().startsWith('avoids:'))
    .map((t) => t.label.replace(/^Avoids:\s*/i, ''));
}

function dnaPreferLabels(dna?: EnterpriseDnaSnapshot | null): string[] {
  return (dna?.traits || [])
    .filter(
      (t) =>
        t.source === 'feedback' ||
        (t.source === 'approval' && t.label.toLowerCase().startsWith('approves:')),
    )
    .map((t) => t.label)
    .slice(0, 3);
}

export function buildEllineaRecommendations(
  summary: EllineaEnterpriseSnapshot | null,
  context?: Pick<EllineaContext, 'role' | 'useRoleContext' | 'dna' | 'useDna' | 'memory' | 'learningSignals'>,
): EllineaRecommendation[] {
  if (!summary || summary.status !== 'synced') return [];

  const out: EllineaRecommendation[] = [];
  const counts = summary.model?.counts;
  const objects = summary.model?.objects || [];
  const attention = objects.filter((o) =>
    (o.status || '').toLowerCase().includes('attention'),
  );
  const branches = objects.filter((o) => o.kind === 'branch');
  const timeline = (summary.timeline || []).slice(0, 3);
  const useDna = context?.useDna !== false;
  const dna = useDna ? context?.dna : null;
  const avoid = dnaAvoidLabels(dna);
  const prefer = dnaPreferLabels(dna);
  const memory = context?.memory || [];
  const pressure =
    context?.learningSignals?.find((s) => s.kind === 'alert_pressure')?.weight ??
    summary.openAlerts + summary.openDecisions;
  const approvalRate = context?.learningSignals?.find((s) => s.kind === 'approval_rate')?.weight;

  const dnaEvidence: string[] = [];
  if (prefer[0]) dnaEvidence.push(`DNA prefers: ${prefer[0]}`);
  if (avoid[0]) dnaEvidence.push(`DNA caution: avoid “${avoid[0]}” paths`);
  if (memory[0]) dnaEvidence.push(`Memory: “${memory[0].title}”`);
  if (timeline[0]) dnaEvidence.push(`Recent: ${timeline[0].title}`);

  if (summary.openAlerts > 0) {
    const pri: EllineaRecommendation['priority'] =
      summary.openAlerts >= 3 || pressure >= 5 ? 'high' : 'medium';
    out.push({
      id: 'alerts',
      title: 'Triage open alerts before the next sync',
      rationale: `${summary.openAlerts} alert(s) remain open — EIP observes SoR health; clear noise so Owner/IT see true risk.`,
      evidence: [
        `Source: ${summary.connectorName}`,
        summary.briefHighlight,
        ...attention.slice(0, 2).map((o) => `Flagged: ${o.name}`),
        ...dnaEvidence.slice(0, 2),
      ].filter(Boolean),
      confidence: Math.min(94, 72 + summary.openAlerts * 4 + (attention.length ? 4 : 0)),
      priority: pri,
    });
  }

  if (summary.openDecisions > 0) {
    const cautious =
      typeof approvalRate === 'number' && approvalRate < 55
        ? ' Org approval rate is selective — brief Owner before auto-pushing.'
        : '';
    out.push({
      id: 'decisions',
      title: 'Clear pending decisions in Approvals',
      rationale: `${summary.openDecisions} open decision(s) / task(s) are blocking flow.${cautious}`,
      evidence: [
        `Model tasks: ${counts?.tasks ?? summary.openDecisions}`,
        `Health score: ${summary.healthScore}/100`,
        ...dnaEvidence.filter((e) => e.startsWith('DNA')).slice(0, 2),
        timeline[0] ? `Timeline: ${timeline[0].title}` : '',
      ].filter(Boolean),
      confidence: Math.min(90, 68 + summary.openDecisions * 5),
      priority: summary.openDecisions >= 2 || pressure >= 4 ? 'high' : 'medium',
    });
  }

  if (attention.length > 0) {
    out.push({
      id: 'attention-objects',
      title: 'Review UEM objects marked for attention',
      rationale: `${attention.length} Universal Enterprise Model object(s) carry attention status — inspect before the next brief.`,
      evidence: [
        ...attention.slice(0, 4).map((o) => `${o.kind}: ${o.name}`),
        ...dnaEvidence.slice(0, 1),
      ],
      confidence: Math.min(92, 78 + attention.length * 3),
      priority: 'high',
    });
  }

  if (summary.healthScore < 70) {
    out.push({
      id: 'health',
      title: 'Investigate enterprise health dip',
      rationale: `Health is ${summary.healthScore}/100 across ${summary.connectedSystems} wrapped system(s). Diagnose connector/sync before changing SoR data.`,
      evidence: [
        summary.briefHighlight,
        counts
          ? `UEM: ${counts.branches} branches, ${counts.people} people, ${counts.notifications} notifications`
          : 'No UEM counts yet',
        `Pressure score: ${pressure}`,
        ...dnaEvidence.slice(0, 1),
      ],
      confidence: Math.min(88, 70 + (70 - summary.healthScore)),
      priority: summary.healthScore < 50 ? 'high' : 'medium',
    });
  }

  const hasPressure =
    summary.openAlerts > 0 || summary.openDecisions > 0 || attention.length > 0 || summary.healthScore < 70;

  if (!hasPressure && branches.length > 0) {
    out.push({
      id: 'steady',
      title: 'Keep the morning brief cadence',
      rationale:
        'No high-severity flags in the model — use Watch / Decide / Delegate in the brief to stay ahead of drift.',
      evidence: [
        `${branches.length} named branch object(s)`,
        `Last sync: ${summary.syncedAt ? new Date(summary.syncedAt).toLocaleString() : 'recent'}`,
        memory[0] ? `Memory anchor: “${memory[0].title}”` : 'Add Memory notes to deepen DNA',
      ],
      confidence: 64,
      priority: 'low',
    });
  }

  if (!out.length) {
    out.push({
      id: 'baseline',
      title: 'Expand connector coverage',
      rationale:
        'Snapshot is synced but light on actionable signals. Add a read-only connector so Ellinea can wrap more SoR surface.',
      evidence: [
        `Connector: ${summary.connectorName}`,
        counts
          ? `${counts.branches} branches · ${counts.people} people`
          : 'UEM counts unavailable',
        dna?.summary || 'DNA still forming',
      ],
      confidence: 58,
      priority: 'low',
    });
  }

  // Tighten priority when DNA feedback values this insight type
  const preferredIds = new Set(
    (dna?.traits || [])
      .filter((t) => t.source === 'feedback')
      .map((t) => t.label.match(/“([^”]+)”/)?.[1])
      .filter(Boolean) as string[],
  );
  for (const r of out) {
    if (preferredIds.has(r.id) && r.priority !== 'high') {
      r.priority = r.priority === 'low' ? 'medium' : 'high';
      r.confidence = Math.min(96, r.confidence + 6);
      r.evidence = [...r.evidence, 'Prioritized from helpful feedback pattern'];
    }
  }

  const lens = roleLens(context?.role);
  const filtered =
    context?.useRoleContext === false
      ? out
      : out.filter((r) => !lens.recFilter || lens.recFilter(r.id));

  return (filtered.length ? filtered : out).slice(0, 5);
}

export function buildRankedRecommendations(
  summary: EllineaEnterpriseSnapshot | null,
  context?: Pick<EllineaContext, 'role' | 'useRoleContext' | 'dna' | 'useDna' | 'memory' | 'learningSignals'> & {
    organizationId?: string;
    useFeedback?: boolean;
  },
): EllineaRecommendation[] {
  const base = buildEllineaRecommendations(summary, context);
  if (!context?.organizationId || context.useFeedback === false) return base;
  return rankRecommendations(base, readRecFeedback(context.organizationId));
}

function briefBuckets(
  summary: EllineaEnterpriseSnapshot,
  context?: EllineaContext,
): { watch: string[]; decide: string[]; delegate: string[] } {
  const lens = roleLens(context?.role);
  const objects = summary.model?.objects || [];
  const attention = objects.filter((o) =>
    (o.status || '').toLowerCase().includes('attention'),
  );
  const watch: string[] = [];
  const decide: string[] = [];
  const delegate: string[] = [];

  if (summary.healthScore < 70) {
    watch.push(`Health ${summary.healthScore}/100 via ${summary.connectorName}`);
  } else {
    watch.push(`Health steady at ${summary.healthScore}/100`);
  }
  if (summary.openAlerts > 0) {
    watch.push(`${summary.openAlerts} open alert(s)`);
  }
  if (attention.length) {
    watch.push(
      `${attention.length} attention object(s): ${attention
        .slice(0, 2)
        .map((o) => o.name)
        .join(', ')}`,
    );
  }
  const tl = (summary.timeline || [])[0];
  if (tl) watch.push(`Latest event: ${tl.title}`);

  if (summary.openDecisions > 0) {
    if (lens.authority === 'owner' || lens.authority === 'it' || lens.authority === 'exec') {
      decide.push(`${summary.openDecisions} open decision(s) need an authority call`);
    } else {
      delegate.push(`${summary.openDecisions} open decision(s) — route to Owner/IT Approvals`);
    }
  }
  if (context?.useDna !== false && context?.dna?.traits.some((t) => t.label.startsWith('Avoids:'))) {
    const avoid = context.dna!.traits.find((t) => t.label.startsWith('Avoids:'));
    if (avoid) decide.push(`DNA caution: ${avoid.label}`);
  }
  if (summary.healthScore < 50 && (lens.authority === 'owner' || lens.authority === 'it')) {
    decide.push('Health critically low — decide whether to pause non-essential syncs');
  }

  if (lens.authority === 'owner') {
    if (summary.openAlerts > 0) delegate.push('IT: triage alerts and connector hygiene');
    if (attention.length) delegate.push('Managers: clear attention objects in-lane');
  } else if (lens.authority === 'it') {
    if (summary.openAlerts > 0) delegate.push('Ops owners: confirm SoR-side fixes after sync');
    if (summary.openDecisions > 0) delegate.push('Owner: Approvals that need org authority');
  } else if (lens.authority === 'exec') {
    delegate.push('IT/Owner: residual sync and Approvals risk');
  } else if (lens.authority === 'manager') {
    if (attention.length) decide.push('Clear attention objects in your branch/lane');
    delegate.push('Escalate org-wide connector or access issues to IT');
  } else {
    delegate.push('Escalate write/authority requests to Owner or IT — EIP does not invent SoR writes');
  }

  if (context?.useMemory !== false && context?.memory?.[0]) {
    watch.push(`Memory: “${context.memory[0].title}”`);
  }

  return {
    watch: watch.slice(0, 4),
    decide: decide.slice(0, 3),
    delegate: delegate.slice(0, 3),
  };
}

export function buildDailyBriefText(
  summary: EllineaEnterpriseSnapshot | null,
  context?: EllineaContext,
): string {
  if (!summary || summary.status !== 'synced') {
    return 'No live snapshot yet. Sync a connector to unlock the CEO daily brief.';
  }
  const counts = summary.model?.counts;
  const synced = summary.syncedAt
    ? new Date(summary.syncedAt).toLocaleString()
    : 'recently';
  const uem = counts
    ? ` Model — branches ${counts.branches}, people ${counts.people}, tasks ${counts.tasks}, alerts ${counts.notifications}.`
    : '';
  const lens = roleLens(context?.role);
  const framed =
    context?.useRoleContext === false
      ? ''
      : ` Framed ${lens.audience} — focus on ${lens.focus}.`;
  const org =
    context?.organizationName && context.useRoleContext !== false
      ? ` ${context.organizationName}:`
      : '';

  const buckets = briefBuckets(summary, context);
  const watch = buckets.watch.length ? ` Watch: ${buckets.watch.join('; ')}.` : '';
  const decide = buckets.decide.length ? ` Decide: ${buckets.decide.join('; ')}.` : '';
  const delegate = buckets.delegate.length ? ` Delegate: ${buckets.delegate.join('; ')}.` : '';

  return `Daily brief${org} (${synced} via ${summary.connectorName}): health ${summary.healthScore}/100, ${summary.openAlerts} alerts, ${summary.openDecisions} open decisions. ${summary.briefHighlight}.${uem}${framed}${watch}${decide}${delegate}`;
}

type Intent =
  | 'dna'
  | 'memory'
  | 'recommend'
  | 'role'
  | 'branch'
  | 'people'
  | 'timeline'
  | 'health'
  | 'alert'
  | 'decision'
  | 'brief'
  | 'connector'
  | 'general';

function detectIntents(q: string): Set<Intent> {
  const intents = new Set<Intent>();
  if (/dna|how we work|our culture|enterprise dna/.test(q)) intents.add('dna');
  if (/memory|policy|policies|note\b|notes\b|decision we/.test(q)) intents.add('memory');
  if (/recommend|should i|next step|insight|what do i|action/.test(q)) intents.add('recommend');
  if (/who am|my role|context/.test(q)) intents.add('role');
  if (/branch|site|location/.test(q)) intents.add('branch');
  if (/people|person|staff|employee|workforce/.test(q)) intents.add('people');
  if (/timeline|what happened|recent/.test(q)) intents.add('timeline');
  if (/health|performing|how are|business|score/.test(q)) intents.add('health');
  if (/alert|risk|attention|incident/.test(q)) intents.add('alert');
  if (/decision|approval|task/.test(q)) intents.add('decision');
  if (/brief|today|morning|summarize|summary/.test(q)) intents.add('brief');
  if (/connector|system|source|integration/.test(q)) intents.add('connector');
  if (!intents.size) intents.add('general');
  return intents;
}

function confidenceFromSignals(
  summary: EllineaEnterpriseSnapshot,
  intents: Set<Intent>,
  memoryHits: number,
  dnaUsed: boolean,
): number {
  let c = 58;
  if (summary.status === 'synced') c += 12;
  if (summary.openAlerts > 0 && (intents.has('alert') || intents.has('general') || intents.has('recommend')))
    c += 8;
  if (summary.openDecisions > 0 && (intents.has('decision') || intents.has('recommend'))) c += 6;
  if (memoryHits) c += Math.min(10, memoryHits * 4);
  if (dnaUsed) c += 4;
  if (summary.healthScore < 70 && intents.has('health')) c += 5;
  if ((summary.timeline || []).length) c += 3;
  return Math.max(40, Math.min(94, c));
}

function memoryHitsForQuestion(q: string, memory: EllineaMemoryNote[]): EllineaMemoryNote[] {
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  return memory.filter((n) => {
    const hay = `${n.title} ${n.body}`.toLowerCase();
    return words.some((w) => hay.includes(w));
  });
}

/** Multi-hop enterprise answer: situation → evidence → risk → action → confidence. */
function synthesizeEnterpriseAnswer(
  question: string,
  summary: EllineaEnterpriseSnapshot,
  options: EllineaContext | undefined,
  intents: Set<Intent>,
): string {
  const useMemory = options?.useMemory !== false;
  const useRole = options?.useRoleContext !== false;
  const useDna = options?.useDna !== false;
  const memory = useMemory ? options?.memory || [] : [];
  const dna = useDna ? options?.dna : null;
  const lens = roleLens(options?.role);
  const prefix =
    useRole && options?.role
      ? `[${options.organizationName || 'Org'} · ${options.role}] `
      : '';

  const counts = summary.model?.counts;
  const objects = summary.model?.objects || [];
  const attention = objects.filter((o) =>
    (o.status || '').toLowerCase().includes('attention'),
  );
  const branches = objects.filter((o) => o.kind === 'branch');
  const memHits = memoryHitsForQuestion(question, memory);
  const signals = options?.learningSignals || [];
  const pressure = signals.find((s) => s.kind === 'alert_pressure');

  // Situation
  const situationParts: string[] = [
    `Health ${summary.healthScore}/100 across ${summary.connectedSystems} connected system(s) (${summary.connectorName})`,
  ];
  if (intents.has('branch') && branches.length) {
    situationParts.push(
      `${counts?.branches ?? branches.length} branch object(s): ${branches
        .slice(0, 4)
        .map((b) => b.name)
        .join('; ')}`,
    );
  } else if (intents.has('people')) {
    situationParts.push(
      `UEM people ${counts?.people ?? 0}, tasks ${counts?.tasks ?? 0}, documents ${counts?.documents ?? 0}`,
    );
  } else if (intents.has('connector')) {
    situationParts.push(
      `Source ${summary.connectorId}; capabilities ${(summary.model?.capabilities || ['read', 'sync']).join(', ')}`,
    );
  } else {
    situationParts.push(
      `${summary.openAlerts} open alerts · ${summary.openDecisions} open decisions`,
    );
  }
  if (useRole) situationParts.push(`Lens: ${lens.focus}`);

  // Evidence (multi-hop: sync + UEM + timeline + memory + DNA + learning)
  const evidence: string[] = [];
  evidence.push(summary.briefHighlight);
  if (counts) {
    evidence.push(
      `UEM counts — branches ${counts.branches}, people ${counts.people}, tasks ${counts.tasks}, notifications ${counts.notifications}`,
    );
  }
  if (attention.length) {
    evidence.push(
      `Attention: ${attention
        .slice(0, 3)
        .map((o) => `${o.kind} ${o.name}`)
        .join('; ')}`,
    );
  }
  for (const ev of (summary.timeline || []).slice(0, 2)) {
    evidence.push(`Timeline: ${ev.title}${ev.detail ? ` — ${ev.detail}` : ''}`);
  }
  for (const n of (memHits.length ? memHits : memory).slice(0, 2)) {
    evidence.push(`Memory “${n.title}”: ${n.body.slice(0, 140)}${n.body.length > 140 ? '…' : ''}`);
  }
  if (dna?.traits?.length) {
    evidence.push(
      `DNA: ${dna.traits
        .slice(0, 2)
        .map((t) => t.label)
        .join('; ')}`,
    );
  }
  for (const s of signals.slice(0, 2)) {
    evidence.push(`Learning: ${s.label} — ${s.detail}`);
  }

  // Risk
  const risks: string[] = [];
  if (summary.openAlerts > 0) {
    risks.push(`${summary.openAlerts} unresolved alert(s) may hide SoR drift`);
  }
  if (summary.openDecisions > 0) {
    risks.push(`${summary.openDecisions} open decision(s) stall operational flow`);
  }
  if (summary.healthScore < 70) {
    risks.push(`Health below 70 — treat connector/sync before changing Systems of Record`);
  }
  if (attention.length) {
    risks.push(`${attention.length} UEM object(s) flagged for attention`);
  }
  const avoid = dnaAvoidLabels(dna);
  if (avoid[0]) risks.push(`DNA marks “${avoid[0]}” as sensitive`);
  if (pressure && pressure.weight >= 4) {
    risks.push(`Elevated pressure score (${pressure.weight})`);
  }
  if (!risks.length) risks.push('No high-severity flags in the latest sync');

  // Recommended action (role-aware, SoR-safe)
  const recs = buildEllineaRecommendations(summary, options);
  let action: string;
  if (intents.has('recommend') && recs[0]) {
    action = `${recs[0].title} — ${recs[0].rationale}`;
  } else if (lens.authority === 'owner') {
    action =
      summary.openDecisions > 0
        ? `Decide open Approvals (${summary.openDecisions}), then have IT clear alert noise. ${lens.actionVerb}.`
        : `${lens.actionVerb}. ${recs[0]?.title || 'Review the daily brief Watch / Decide / Delegate sections.'}`;
  } else if (lens.authority === 'it') {
    action =
      summary.openAlerts > 0 || summary.healthScore < 70
        ? `Verify connector sync and access hygiene first; do not invent SoR writes. ${lens.actionVerb}.`
        : `${lens.actionVerb}. Confirm read-only connectors stay healthy for the next brief.`;
  } else if (lens.authority === 'viewer') {
    action = `${lens.actionVerb}. Share this brief with Owner/IT if risk rises.`;
  } else {
    action = recs[0]
      ? `${recs[0].title}. ${lens.actionVerb}.`
      : `${lens.actionVerb}. Use Approvals only within your authority.`;
  }

  const conf = confidenceFromSignals(summary, intents, memHits.length, Boolean(dna?.traits?.length));

  return (
    `${prefix}` +
    `Situation: ${situationParts.join('. ')}. ` +
    `Evidence: ${evidence.filter(Boolean).slice(0, 6).join(' · ')}. ` +
    `Risk: ${risks.slice(0, 4).join('; ')}. ` +
    `Recommended action: ${action} ` +
    `Confidence: ${conf}%.`
  );
}

export function buildEllineaAnswer(
  question: string,
  summary: EllineaEnterpriseSnapshot | null,
  options?: EllineaContext,
): string {
  const q = question.toLowerCase();
  const memory = options?.memory || [];
  const useMemory = options?.useMemory !== false;
  const useRole = options?.useRoleContext !== false;
  const useDna = options?.useDna !== false;
  const dna = options?.dna;
  const lens = roleLens(options?.role);
  const prefix =
    useRole && options?.role
      ? `[${options.organizationName || 'Org'} · ${options.role}] `
      : '';
  const intents = detectIntents(q);

  // DNA-primary short answer still available, then hop into full synthesis if synced
  if (useDna && dna && intents.has('dna') && intents.size === 1) {
    return `${prefix}${dna.summary} Traits: ${dna.traits
      .slice(0, 5)
      .map((t) => t.label)
      .join('; ')}. Ellinea uses DNA to bias Approvals caution and recommendation priority — it does not write to Systems of Record.`;
  }

  if (
    useMemory &&
    memory.length &&
    intents.has('memory') &&
    !intents.has('general') &&
    intents.size <= 2
  ) {
    const hit =
      memory.find((n) => q.includes(n.title.toLowerCase().slice(0, 12))) ||
      memoryHitsForQuestion(q, memory)[0] ||
      memory[0];
    if (!summary || summary.status !== 'synced') {
      return `${prefix}From Enterprise Memory — “${hit.title}”: ${hit.body}`;
    }
  }

  if (!summary || summary.status !== 'synced') {
    return 'I do not have a live enterprise snapshot yet. Ask IT to open Connectors and sync a system, then ask again. Ellinea observes and wraps Systems of Record — it cannot invent live SoR data.';
  }

  if (intents.has('role') && intents.size === 1) {
    const dnaBit =
      useDna && dna?.traits.length
        ? ` Enterprise DNA: ${dna.traits
            .slice(0, 2)
            .map((t) => t.label)
            .join('; ')}.`
        : '';
    return `${prefix}You are signed in ${lens.audience}. I prioritize ${lens.focus}. Action stance: ${lens.actionVerb}.${dnaBit} Ask about health, alerts, recommendations, DNA, memory, or the daily brief.`;
  }

  if (intents.has('brief') && !intents.has('recommend')) {
    return buildDailyBriefText(summary, options);
  }

  // Multi-hop default (and for recommend / health / alert / decision / general / mixed intents)
  return synthesizeEnterpriseAnswer(question, summary, options, intents);
}
