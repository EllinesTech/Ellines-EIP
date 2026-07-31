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

export function buildEllineaRecommendations(
  summary: EnterpriseSummaryDto | null,
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

  return out.slice(0, 5);
}

export function buildDailyBriefText(summary: EnterpriseSummaryDto | null): string {
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
  return `Daily brief (${synced} via ${summary.connectorName}): health ${summary.healthScore}/100, ${summary.openAlerts} alerts, ${summary.openDecisions} open decisions. ${summary.briefHighlight}.${uem}`;
}

export function buildEllineaAnswer(
  question: string,
  summary: EnterpriseSummaryDto | null,
  options?: { memory?: EllineaMemoryNote[]; useMemory?: boolean },
): string {
  const q = question.toLowerCase();
  const memory = options?.memory || [];
  const useMemory = options?.useMemory !== false;

  if (useMemory && memory.length && (q.includes('memory') || q.includes('policy') || q.includes('note') || q.includes('decision we'))) {
    const hit =
      memory.find((n) => q.includes(n.title.toLowerCase().slice(0, 12))) || memory[0];
    return `From Enterprise Memory — “${hit.title}”: ${hit.body}`;
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
  const synced = summary.syncedAt
    ? new Date(summary.syncedAt).toLocaleString()
    : 'recently';

  if (q.includes('recommend') || q.includes('should i') || q.includes('next step') || q.includes('insight')) {
    const recs = buildEllineaRecommendations(summary);
    if (!recs.length) return 'No recommendations yet — sync richer data first.';
    return recs
      .slice(0, 3)
      .map(
        (r) =>
          `${r.title} (${r.confidence}% confidence, ${r.priority}): ${r.rationale} Evidence: ${r.evidence.join('; ')}`,
      )
      .join(' · ');
  }

  if (q.includes('branch') || q.includes('site') || q.includes('location')) {
    if (branches.length) {
      const list = branches
        .slice(0, 6)
        .map((b) => `${b.name}${b.status ? ` (${b.status})` : ''}`)
        .join('; ');
      return `I see ${counts?.branches ?? branches.length} branch object(s) in the Universal Enterprise Model: ${list}. ${attention.length ? `${attention.length} need attention.` : 'None flagged for attention.'}`;
    }
    return `Branch count in the model is ${counts?.branches ?? 0}. Sync a richer System B feed to list named branches.`;
  }

  if (q.includes('people') || q.includes('person') || q.includes('staff') || q.includes('employee')) {
    return `People count in the Universal Enterprise Model is ${counts?.people ?? 0}. Tasks ${counts?.tasks ?? 0}, documents ${counts?.documents ?? 0}, assets ${counts?.assets ?? 0}.`;
  }

  if (q.includes('timeline') || q.includes('what happened') || q.includes('recent')) {
    const events = (summary.timeline || []).slice(0, 4);
    if (!events.length) {
      return 'No timeline events in the latest snapshot yet.';
    }
    return `Recent enterprise events: ${events.map((e) => e.title).join(' · ')}. Open Timeline for the full feed.`;
  }

  if (q.includes('health') || q.includes('performing') || q.includes('how are') || q.includes('business')) {
    const uem = counts
      ? ` UEM: ${counts.branches} branches, ${counts.people} people, ${counts.tasks} tasks, ${counts.notifications} notifications.`
      : '';
    return `Enterprise health is ${summary.healthScore}/100 across ${summary.connectedSystems} connected systems.${uem} ${summary.briefHighlight}`;
  }

  if (q.includes('alert') || q.includes('risk') || q.includes('attention')) {
    const named = attention.length
      ? ` Flagged objects: ${attention
          .slice(0, 4)
          .map((o) => o.name)
          .join(', ')}.`
      : '';
    return `There are ${summary.openAlerts} open alerts in the latest sync.${named} ${summary.briefHighlight}`;
  }

  if (q.includes('decision') || q.includes('approval') || q.includes('task')) {
    return `There are ${summary.openDecisions} open decisions and ${counts?.tasks ?? summary.openDecisions} tasks in the model. Prioritize them before the next brief cycle.`;
  }

  if (q.includes('brief') || q.includes('today') || q.includes('morning') || q.includes('summarize')) {
    return buildDailyBriefText(summary);
  }

  if (q.includes('connector') || q.includes('system') || q.includes('source')) {
    return `Latest source is ${summary.connectorName} (${summary.connectorId}), health ${summary.healthScore}, capabilities ${(model?.capabilities || ['read', 'sync']).join(', ')}.`;
  }

  if (useMemory && memory.length && q.length > 8) {
    const soft = memory.find((n) => {
      const hay = `${n.title} ${n.body}`.toLowerCase();
      return q.split(/\s+/).some((w) => w.length > 4 && hay.includes(w));
    });
    if (soft) {
      return `From ${summary.connectorName}: health ${summary.healthScore}, ${summary.openAlerts} alerts. Related memory “${soft.title}”: ${soft.body}`;
    }
  }

  return `From ${summary.connectorName}: health ${summary.healthScore}, ${summary.openAlerts} alerts, ${summary.openDecisions} open decisions${counts ? `, ${counts.branches} branches / ${counts.people} people` : ''}. ${summary.briefHighlight}`;
}
