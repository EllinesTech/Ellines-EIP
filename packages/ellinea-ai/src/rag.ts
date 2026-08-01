import type { EllineaEnterpriseSnapshot } from './types';
import type { EllineaMemoryNote, EnterpriseDnaSnapshot } from './engine';

export type RagChunk = {
  id: string;
  source: 'snapshot' | 'memory' | 'dna' | 'timeline' | 'uem' | 'alert' | 'decision';
  title: string;
  text: string;
  score: number;
};

const STOP = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'how',
  'its',
  'let',
  'may',
  'say',
  'she',
  'too',
  'use',
  'what',
  'when',
  'who',
  'with',
  'this',
  'that',
  'from',
  'have',
  'been',
  'will',
  'your',
  'about',
  'into',
  'than',
  'then',
  'them',
  'they',
  'were',
  'which',
  'there',
  'their',
  'would',
  'could',
  'should',
  'please',
  'tell',
  'give',
  'show',
  'ellinea',
]);

/** Enterprise synonym expansion so ops language matches UEM/snapshot terms. */
const SYNONYMS: Record<string, string[]> = {
  alert: ['alerts', 'risk', 'notification', 'attention', 'incident'],
  alerts: ['alert', 'risk', 'notification', 'attention'],
  risk: ['alert', 'alerts', 'attention', 'health'],
  decision: ['decisions', 'approval', 'approvals', 'task', 'tasks'],
  decisions: ['decision', 'approval', 'approvals', 'task'],
  approval: ['approvals', 'decision', 'decisions'],
  health: ['performing', 'performance', 'score', 'status'],
  branch: ['branches', 'site', 'location', 'locations'],
  people: ['staff', 'employee', 'employees', 'person', 'workforce'],
  memory: ['policy', 'policies', 'note', 'notes'],
  dna: ['culture', 'traits', 'how we work'],
  brief: ['today', 'morning', 'summary', 'summarize'],
  connector: ['system', 'systems', 'source', 'integration'],
};

function tokenize(q: string): string[] {
  const raw = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const expanded = new Set<string>(raw);
  for (const t of raw) {
    const syn = SYNONYMS[t];
    if (syn) for (const s of syn) expanded.add(s);
  }
  return [...expanded];
}

function scoreText(tokens: string[], hay: string): number {
  if (!tokens.length) return 0;
  const h = hay.toLowerCase();
  let hits = 0;
  let weight = 0;
  for (const t of tokens) {
    if (!h.includes(t)) continue;
    hits += 1;
    // Longer / rarer tokens count more
    weight += Math.min(2.2, 0.55 + t.length * 0.12);
  }
  const coverage = hits / tokens.length;
  const density = weight / Math.max(1, tokens.length);
  // Light bigram bonus for adjacent query terms present as phrase
  let phrase = 0;
  const words = hay.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const set = new Set(words);
  for (let i = 0; i < tokens.length - 1; i++) {
    if (set.has(tokens[i]) && set.has(tokens[i + 1])) phrase += 0.08;
  }
  return Math.min(1, coverage * 0.65 + density * 0.35 + phrase);
}

function sourceBoost(source: RagChunk['source']): number {
  switch (source) {
    case 'memory':
      return 0.28;
    case 'alert':
      return 0.24;
    case 'decision':
      return 0.22;
    case 'dna':
      return 0.16;
    case 'timeline':
      return 0.1;
    case 'uem':
      return 0.08;
    default:
      return 0.05;
  }
}

/** Retrieve grounded context chunks for Ellinea (local RAG over sync + Memory + DNA). */
export function retrieveEllineaContext(input: {
  question: string;
  summary: EllineaEnterpriseSnapshot | null;
  memory?: EllineaMemoryNote[];
  dna?: EnterpriseDnaSnapshot | null;
  limit?: number;
}): RagChunk[] {
  const tokens = tokenize(input.question);
  const chunks: RagChunk[] = [];
  const summary = input.summary;
  const limit = input.limit ?? 8;

  if (summary && summary.status === 'synced') {
    const objects = summary.model?.objects || [];
    const attention = objects.filter((o) =>
      (o.status || '').toLowerCase().includes('attention'),
    );

    chunks.push({
      id: 'snap_health',
      source: 'snapshot',
      title: 'Enterprise health',
      text: `Health ${summary.healthScore}/100 via ${summary.connectorName}. ${summary.openAlerts} alerts, ${summary.openDecisions} open decisions. ${summary.briefHighlight}`,
      score:
        0.32 +
        scoreText(tokens, `${summary.briefHighlight} health alerts decisions performance`) +
        (summary.healthScore < 70 ? 0.12 : 0),
    });

    if (summary.openAlerts > 0 || attention.length > 0) {
      const named = attention
        .slice(0, 4)
        .map((o) => `${o.kind}: ${o.name}`)
        .join('; ');
      chunks.push({
        id: 'open_alerts',
        source: 'alert',
        title: 'Open alerts & attention',
        text: `${summary.openAlerts} open alert(s). ${named || summary.briefHighlight}`,
        score:
          0.38 +
          sourceBoost('alert') +
          scoreText(tokens, `alert risk attention ${named}`) +
          Math.min(0.15, summary.openAlerts * 0.03),
      });
    }

    if (summary.openDecisions > 0) {
      chunks.push({
        id: 'open_decisions',
        source: 'decision',
        title: 'Open decisions',
        text: `${summary.openDecisions} open decision(s) / task(s) in the latest sync. Model tasks: ${summary.model?.counts?.tasks ?? summary.openDecisions}.`,
        score:
          0.36 +
          sourceBoost('decision') +
          scoreText(tokens, 'decision approval task pending') +
          Math.min(0.12, summary.openDecisions * 0.04),
      });
    }

    const counts = summary.model?.counts;
    if (counts) {
      chunks.push({
        id: 'snap_uem',
        source: 'uem',
        title: 'Universal Enterprise Model',
        text: `Branches ${counts.branches}, people ${counts.people}, tasks ${counts.tasks}, documents ${counts.documents}, assets ${counts.assets}, notifications ${counts.notifications}.`,
        score:
          0.22 +
          sourceBoost('uem') +
          scoreText(tokens, 'branch people task document asset notification model'),
      });
    }

    for (const [idx, ev] of (summary.timeline || []).slice(0, 8).entries()) {
      chunks.push({
        id: `tl_${idx}`,
        source: 'timeline',
        title: ev.title,
        text: `${ev.title}${ev.detail ? `: ${ev.detail}` : ''}`,
        score:
          0.18 +
          sourceBoost('timeline') +
          scoreText(tokens, `${ev.title} ${ev.detail || ''}`),
      });
    }

    for (const obj of objects.slice(0, 14)) {
      const isAttention = (obj.status || '').toLowerCase().includes('attention');
      chunks.push({
        id: `uem_${obj.id || obj.name}`,
        source: 'uem',
        title: obj.name,
        text: `${obj.kind}: ${obj.name}${obj.status ? ` (${obj.status})` : ''}`,
        score:
          0.12 +
          sourceBoost('uem') +
          (isAttention ? 0.2 : 0) +
          scoreText(tokens, `${obj.kind} ${obj.name} ${obj.status || ''} attention`),
      });
    }
  }

  for (const note of input.memory || []) {
    chunks.push({
      id: note.id,
      source: 'memory',
      title: note.title,
      text: note.body,
      score:
        0.42 +
        sourceBoost('memory') +
        scoreText(tokens, `${note.title} ${note.body} policy decision`),
    });
  }

  if (input.dna?.traits?.length) {
    chunks.push({
      id: 'dna_summary',
      source: 'dna',
      title: 'Enterprise DNA',
      text: `${input.dna.summary} Traits: ${input.dna.traits
        .slice(0, 6)
        .map((t) => `${t.label} — ${t.detail}`)
        .join('; ')}`,
      score:
        0.28 +
        sourceBoost('dna') +
        scoreText(tokens, `dna culture how we work ${input.dna.summary}`),
    });
  }

  const ranked = chunks.sort((a, b) => b.score - a.score);

  // When synced, always return ranked citations (at least health + top signals).
  if (summary && summary.status === 'synced' && ranked.length) {
    return ranked.slice(0, limit);
  }
  return ranked.slice(0, limit);
}

export function formatRagGrounding(chunks: RagChunk[]): string {
  if (!chunks.length) return '';
  return chunks
    .map((c, i) => `[${i + 1}:${c.source}] ${c.title}: ${c.text}`)
    .join('\n');
}
