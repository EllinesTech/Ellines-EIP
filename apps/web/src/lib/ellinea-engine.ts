import type { EnterpriseSummaryDto } from '@/lib/api';

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

export type LearningSignal = {
  id: string;
  kind: 'approval_rate' | 'alert_pressure' | 'feedback_bias' | 'memory_depth';
  label: string;
  detail: string;
  weight: number;
};

/** Lightweight outcome signals for continuous learning (local, per org). */
export function buildLearningSignals(input: {
  summary: EnterpriseSummaryDto | null;
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
};

function roleLens(role: string | undefined): {
  audience: string;
  focus: string;
  recFilter?: (id: string) => boolean;
} {
  switch (role) {
    case 'owner':
      return {
        audience: 'as Organization Owner',
        focus: 'authority, risk, and org-wide decisions',
        recFilter: () => true,
      };
    case 'admin':
      return {
        audience: 'as IT Admin',
        focus: 'connectors, sync health, and access hygiene',
        recFilter: (id) => id !== 'steady',
      };
    case 'executive':
      return {
        audience: 'for the executive view',
        focus: 'health score, alerts, and cross-branch performance',
        recFilter: (id) => id !== 'baseline',
      };
    case 'manager':
      return {
        audience: 'for your management lane',
        focus: 'tasks, branch attention, and open decisions',
        recFilter: (id) => id === 'decisions' || id === 'attention-objects' || id === 'alerts' || id === 'health',
      };
    case 'viewer':
      return {
        audience: 'in read-only mode',
        focus: 'status and brief highlights (no write actions)',
        recFilter: (id) => id === 'steady' || id === 'health' || id === 'alerts',
      };
    default:
      return {
        audience: 'for your work role',
        focus: 'open alerts, tasks, and the daily brief',
        recFilter: (id) => id !== 'baseline',
      };
  }
}

export function buildEllineaRecommendations(
  summary: EnterpriseSummaryDto | null,
  context?: Pick<EllineaContext, 'role' | 'useRoleContext'>,
): EllineaRecommendation[] {
  if (!summary || summary.status !== 'synced') return [];

  const out: EllineaRecommendation[] = [];
  const counts = summary.model?.counts;
  const objects = summary.model?.objects || [];
  const attention = objects.filter((o) =>
    (o.status || '').toLowerCase().includes('attention'),
  );
  const branches = objects.filter((o) => o.kind === 'branch');

  if (summary.openAlerts > 0) {
    out.push({
      id: 'alerts',
      title: 'Triage open alerts before the next sync',
      rationale: `${summary.openAlerts} alert(s) remain open in the latest snapshot.`,
      evidence: [
        `Source: ${summary.connectorName}`,
        summary.briefHighlight,
        ...(attention.slice(0, 2).map((o) => `Flagged: ${o.name}`)),
      ],
      confidence: Math.min(92, 70 + summary.openAlerts * 4),
      priority: summary.openAlerts >= 3 ? 'high' : 'medium',
    });
  }

  if (summary.openDecisions > 0) {
    out.push({
      id: 'decisions',
      title: 'Clear pending decisions',
      rationale: `${summary.openDecisions} open decision(s) / task(s) are blocking flow.`,
      evidence: [
        `Model tasks: ${counts?.tasks ?? summary.openDecisions}`,
        `Health score: ${summary.healthScore}/100`,
      ],
      confidence: Math.min(88, 65 + summary.openDecisions * 5),
      priority: summary.openDecisions >= 2 ? 'high' : 'medium',
    });
  }

  if (attention.length > 0) {
    out.push({
      id: 'attention-objects',
      title: 'Review objects marked for attention',
      rationale: `${attention.length} UEM object(s) carry an attention status.`,
      evidence: attention.slice(0, 4).map((o) => `${o.kind}: ${o.name}`),
      confidence: 80,
      priority: 'high',
    });
  }

  if (summary.healthScore < 70) {
    out.push({
      id: 'health',
      title: 'Investigate enterprise health dip',
      rationale: `Health is ${summary.healthScore}/100 across ${summary.connectedSystems} system(s).`,
      evidence: [
        summary.briefHighlight,
        counts
          ? `UEM: ${counts.branches} branches, ${counts.people} people, ${counts.notifications} notifications`
          : 'No UEM counts yet',
      ],
      confidence: 75,
      priority: summary.healthScore < 50 ? 'high' : 'medium',
    });
  }

  if (branches.length > 0 && attention.length === 0 && summary.openAlerts === 0) {
    out.push({
      id: 'steady',
      title: 'Keep the morning brief cadence',
      rationale: 'No high-severity flags in the model — use the brief to stay ahead of drift.',
      evidence: [
        `${branches.length} named branch object(s)`,
        `Last sync: ${summary.syncedAt ? new Date(summary.syncedAt).toLocaleString() : 'recent'}`,
      ],
      confidence: 62,
      priority: 'low',
    });
  }

  if (!out.length) {
    out.push({
      id: 'baseline',
      title: 'Expand connector coverage',
      rationale: 'Snapshot is synced but light on actionable signals.',
      evidence: [
        `Connector: ${summary.connectorName}`,
        counts
          ? `${counts.branches} branches · ${counts.people} people`
          : 'UEM counts unavailable',
      ],
      confidence: 55,
      priority: 'low',
    });
  }

  const lens = roleLens(context?.role);
  const filtered =
    context?.useRoleContext === false
      ? out
      : out.filter((r) => !lens.recFilter || lens.recFilter(r.id));

  return (filtered.length ? filtered : out).slice(0, 5);
}

export function buildRankedRecommendations(
  summary: EnterpriseSummaryDto | null,
  context?: Pick<EllineaContext, 'role' | 'useRoleContext'> & {
    organizationId?: string;
    useFeedback?: boolean;
  },
): EllineaRecommendation[] {
  const base = buildEllineaRecommendations(summary, context);
  if (!context?.organizationId || context.useFeedback === false) return base;
  return rankRecommendations(base, readRecFeedback(context.organizationId));
}

export function buildDailyBriefText(
  summary: EnterpriseSummaryDto | null,
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
  return `Daily brief${org} (${synced} via ${summary.connectorName}): health ${summary.healthScore}/100, ${summary.openAlerts} alerts, ${summary.openDecisions} open decisions. ${summary.briefHighlight}.${uem}${framed}`;
}

export function buildEllineaAnswer(
  question: string,
  summary: EnterpriseSummaryDto | null,
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

  if (useDna && dna && (q.includes('dna') || q.includes('how we work') || q.includes('our culture') || q.includes('enterprise dna'))) {
    return `${prefix}${dna.summary} Traits: ${dna.traits
      .slice(0, 5)
      .map((t) => t.label)
      .join('; ')}.`;
  }

  if (useMemory && memory.length && (q.includes('memory') || q.includes('policy') || q.includes('note') || q.includes('decision we'))) {
    const hit =
      memory.find((n) => q.includes(n.title.toLowerCase().slice(0, 12))) || memory[0];
    return `${prefix}From Enterprise Memory — “${hit.title}”: ${hit.body}`;
  }

  if (!summary || summary.status !== 'synced') {
    return 'I do not have a live enterprise snapshot yet. Ask IT to open Connectors and sync a system, then ask again.';
  }

  const model = summary.model;
  const counts = model?.counts;
  const objects = model?.objects || [];
  const branches = objects.filter((o) => o.kind === 'branch');
  const attention = objects.filter((o) =>
    (o.status || '').toLowerCase().includes('attention'),
  );

  if (q.includes('recommend') || q.includes('should i') || q.includes('next step') || q.includes('insight')) {
    const recs = buildEllineaRecommendations(summary, options);
    if (!recs.length) return `${prefix}No recommendations yet — sync richer data first.`;
    const dnaHint =
      useDna && dna?.traits[0]
        ? ` Aligned with DNA “${dna.traits[0].label}”.`
        : '';
    return (
      prefix +
      recs
        .slice(0, 3)
        .map(
          (r) =>
            `${r.title} (${r.confidence}% confidence, ${r.priority}): ${r.rationale} Evidence: ${r.evidence.join('; ')}`,
        )
        .join(' · ') +
      dnaHint
    );
  }

  if (q.includes('who am') || q.includes('my role') || q.includes('context')) {
    const dnaBit =
      useDna && dna?.traits.length
        ? ` Enterprise DNA: ${dna.traits
            .slice(0, 2)
            .map((t) => t.label)
            .join('; ')}.`
        : '';
    return `${prefix}You are signed in ${lens.audience}. I prioritize ${lens.focus}.${dnaBit} Ask about health, alerts, recommendations, DNA, or memory.`;
  }

  if (q.includes('branch') || q.includes('site') || q.includes('location')) {
    if (branches.length) {
      const list = branches
        .slice(0, 6)
        .map((b) => `${b.name}${b.status ? ` (${b.status})` : ''}`)
        .join('; ');
      return `${prefix}I see ${counts?.branches ?? branches.length} branch object(s) in the Universal Enterprise Model: ${list}. ${attention.length ? `${attention.length} need attention.` : 'None flagged for attention.'}`;
    }
    return `${prefix}Branch count in the model is ${counts?.branches ?? 0}. Sync a richer System B feed to list named branches.`;
  }

  if (q.includes('people') || q.includes('person') || q.includes('staff') || q.includes('employee')) {
    return `${prefix}People count in the Universal Enterprise Model is ${counts?.people ?? 0}. Tasks ${counts?.tasks ?? 0}, documents ${counts?.documents ?? 0}, assets ${counts?.assets ?? 0}.`;
  }

  if (q.includes('timeline') || q.includes('what happened') || q.includes('recent')) {
    const events = (summary.timeline || []).slice(0, 4);
    if (!events.length) {
      return `${prefix}No timeline events in the latest snapshot yet.`;
    }
    return `${prefix}Recent enterprise events: ${events.map((e) => e.title).join(' · ')}. Open Timeline for the full feed.`;
  }

  if (q.includes('health') || q.includes('performing') || q.includes('how are') || q.includes('business')) {
    const uem = counts
      ? ` UEM: ${counts.branches} branches, ${counts.people} people, ${counts.tasks} tasks, ${counts.notifications} notifications.`
      : '';
    return `${prefix}Enterprise health is ${summary.healthScore}/100 across ${summary.connectedSystems} connected systems.${uem} ${summary.briefHighlight}`;
  }

  if (q.includes('alert') || q.includes('risk') || q.includes('attention')) {
    const named = attention.length
      ? ` Flagged objects: ${attention
          .slice(0, 4)
          .map((o) => o.name)
          .join(', ')}.`
      : '';
    return `${prefix}There are ${summary.openAlerts} open alerts in the latest sync.${named} ${summary.briefHighlight}`;
  }

  if (q.includes('decision') || q.includes('approval') || q.includes('task')) {
    return `${prefix}There are ${summary.openDecisions} open decisions and ${counts?.tasks ?? summary.openDecisions} tasks in the model. Prioritize them before the next brief cycle.`;
  }

  if (q.includes('brief') || q.includes('today') || q.includes('morning') || q.includes('summarize')) {
    return buildDailyBriefText(summary, options);
  }

  if (q.includes('connector') || q.includes('system') || q.includes('source')) {
    return `${prefix}Latest source is ${summary.connectorName} (${summary.connectorId}), health ${summary.healthScore}, capabilities ${(model?.capabilities || ['read', 'sync']).join(', ')}.`;
  }

  if (useMemory && memory.length && q.length > 8) {
    const soft = memory.find((n) => {
      const hay = `${n.title} ${n.body}`.toLowerCase();
      return q.split(/\s+/).some((w) => w.length > 4 && hay.includes(w));
    });
    if (soft) {
      return `${prefix}From ${summary.connectorName}: health ${summary.healthScore}, ${summary.openAlerts} alerts. Related memory “${soft.title}”: ${soft.body}`;
    }
  }

  return `${prefix}From ${summary.connectorName}: health ${summary.healthScore}, ${summary.openAlerts} alerts, ${summary.openDecisions} open decisions${counts ? `, ${counts.branches} branches / ${counts.people} people` : ''}. ${summary.briefHighlight}`;
}
