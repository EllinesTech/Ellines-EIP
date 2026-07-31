import type { EnterpriseSummaryDto } from '@/lib/api';
import type { EllineaMemoryNote, EnterpriseDnaSnapshot } from '@/lib/ellinea-engine';

export type RagChunk = {
  id: string;
  source: 'snapshot' | 'memory' | 'dna' | 'timeline' | 'uem';
  title: string;
  text: string;
  score: number;
};

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function scoreText(tokens: string[], hay: string): number {
  if (!tokens.length) return 0;
  const h = hay.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (h.includes(t)) hits += 1;
  }
  return hits / tokens.length;
}

/** Retrieve grounded context chunks for Ellinea (local RAG over sync + Memory + DNA). */
export function retrieveEllineaContext(input: {
  question: string;
  summary: EnterpriseSummaryDto | null;
  memory?: EllineaMemoryNote[];
  dna?: EnterpriseDnaSnapshot | null;
  limit?: number;
}): RagChunk[] {
  const tokens = tokenize(input.question);
  const chunks: RagChunk[] = [];
  const summary = input.summary;

  if (summary && summary.status === 'synced') {
    chunks.push({
      id: 'snap_health',
      source: 'snapshot',
      title: 'Enterprise health',
      text: `Health ${summary.healthScore}/100 via ${summary.connectorName}. ${summary.openAlerts} alerts, ${summary.openDecisions} open decisions. ${summary.briefHighlight}`,
      score: 0.35 + scoreText(tokens, `${summary.briefHighlight} health alerts decisions`),
    });
    const counts = summary.model?.counts;
    if (counts) {
      chunks.push({
        id: 'snap_uem',
        source: 'uem',
        title: 'Universal Enterprise Model',
        text: `Branches ${counts.branches}, people ${counts.people}, tasks ${counts.tasks}, documents ${counts.documents}, assets ${counts.assets}, notifications ${counts.notifications}.`,
        score: 0.25 + scoreText(tokens, 'branch people task document asset notification model'),
      });
    }
    for (const [idx, ev] of (summary.timeline || []).slice(0, 8).entries()) {
      chunks.push({
        id: `tl_${idx}`,
        source: 'timeline',
        title: ev.title,
        text: `${ev.title}${ev.detail ? `: ${ev.detail}` : ''}`,
        score: 0.2 + scoreText(tokens, `${ev.title} ${ev.detail || ''}`),
      });
    }
    for (const obj of (summary.model?.objects || []).slice(0, 12)) {
      chunks.push({
        id: `uem_${obj.id || obj.name}`,
        source: 'uem',
        title: obj.name,
        text: `${obj.kind}: ${obj.name}${obj.status ? ` (${obj.status})` : ''}`,
        score: 0.15 + scoreText(tokens, `${obj.kind} ${obj.name} ${obj.status || ''}`),
      });
    }
  }

  for (const note of input.memory || []) {
    chunks.push({
      id: note.id,
      source: 'memory',
      title: note.title,
      text: note.body,
      score: 0.4 + scoreText(tokens, `${note.title} ${note.body}`),
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
      score: 0.3 + scoreText(tokens, `dna culture how we work ${input.dna.summary}`),
    });
  }

  return chunks
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 8);
}

export function formatRagGrounding(chunks: RagChunk[]): string {
  if (!chunks.length) return '';
  return chunks
    .map((c, i) => `[${i + 1}:${c.source}] ${c.title}: ${c.text}`)
    .join('\n');
}
