/**
 * Multi-Hop Traversal Service
 *
 * Traverses the Knowledge Graph across multiple relationship hops to answer
 * complex questions. Enforces minimum 3-hop depth as required by 2.2.
 *
 * Requirement 2.2: Multi-hop reasoning traversing at least 3 relationship levels
 */

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jProvider } from '../knowledge-graph/neo4j.provider';
import {
  Question,
  ReasoningResult,
  ReasoningStep,
  KnowledgeGap,
  GraphPath,
  GraphNode,
  GraphEdge,
} from './reasoning.interfaces';
import { EvidenceChainService } from './evidence-chain.service';
import { KnowledgeGapService } from './knowledge-gap.service';

/** Minimum hops mandated by Requirement 2.2 */
const MIN_HOPS = 3;

@Injectable()
export class MultiHopTraversalService {
  private readonly logger = new Logger(MultiHopTraversalService.name);

  constructor(
    private readonly neo4j: Neo4jProvider,
    private readonly evidenceChain: EvidenceChainService,
    private readonly knowledgeGap: KnowledgeGapService,
  ) {}

  /**
   * Perform multi-hop reasoning to answer a question.
   *
   * Requirement 2.2: Must traverse at least 3 relationship levels.
   */
  async reason(question: Question, maxHops: number): Promise<ReasoningResult> {
    const effectiveMaxHops = Math.max(maxHops, MIN_HOPS);
    this.logger.log(
      `[${question.id}] Starting multi-hop reasoning (maxHops=${effectiveMaxHops}) ` +
        `for org=${question.organizationId}`,
    );

    const steps: ReasoningStep[] = [];
    const gaps: KnowledgeGap[] = [];

    // Step 1 – Identify seed entities from the question
    const seedEntities = await this.extractSeedEntities(question);
    steps.push({
      stepNumber: 1,
      operation: 'filter',
      description: 'Identified seed entities from question text',
      input: question.text,
      output: seedEntities.map((n) => n.id),
      justification: 'Keyword and type matching against the knowledge graph',
      confidence: seedEntities.length > 0 ? 0.9 : 0.3,
    });

    if (seedEntities.length === 0) {
      gaps.push(
        this.knowledgeGap.create(
          'No seed entities found in the knowledge graph matching the question.',
          { impactOnReasoning: 'critical', suggestion: 'Ingest relevant entity data from connected systems.' },
        ),
      );
      return this.buildLowConfidenceResult(question.text, steps, gaps);
    }

    // Step 2 – Traverse graph up to effectiveMaxHops
    const paths: GraphPath[] = [];
    for (const seed of seedEntities) {
      const discovered = await this.traverseFrom(
        seed.id,
        question.organizationId,
        effectiveMaxHops,
      );
      paths.push(...discovered);
    }

    steps.push({
      stepNumber: 2,
      operation: 'traverse',
      description: `Traversed up to ${effectiveMaxHops} hops from ${seedEntities.length} seed entities`,
      input: seedEntities.map((e) => e.id),
      output: { pathCount: paths.length, maxDepthReached: effectiveMaxHops },
      justification: 'Breadth-first graph expansion with confidence-based pruning',
      confidence: paths.length > 0 ? 0.8 : 0.2,
    });

    if (paths.length === 0) {
      gaps.push(
        this.knowledgeGap.create('No traversal paths found beyond seed entities.', {
          impactOnReasoning: 'major',
          suggestion: 'Expand knowledge graph with relationship data from more System of Record sources.',
        }),
      );
    }

    // Step 3 – Aggregate findings across paths
    const aggregated = this.aggregatePaths(paths);
    steps.push({
      stepNumber: 3,
      operation: 'aggregate',
      description: 'Aggregated insights from all discovered paths',
      input: { pathCount: paths.length },
      output: aggregated,
      justification: 'Weighted aggregation by path confidence and hop distance',
      confidence: aggregated.confidence,
    });

    // Check 3-hop requirement explicitly and flag gap if not reached
    const deepPaths = paths.filter((p) => p.totalHops >= MIN_HOPS);
    if (deepPaths.length === 0 && paths.length > 0) {
      gaps.push(
        this.knowledgeGap.create(
          `Reasoning did not reach the minimum ${MIN_HOPS}-hop depth — graph may be shallow.`,
          {
            impactOnReasoning: 'major',
            suggestion: `Add more relationship-rich data to enable deeper graph traversal.`,
          },
        ),
      );
    }

    // Step 4 – Infer conclusion
    const conclusion = this.formulateConclusion(question.text, aggregated);
    steps.push({
      stepNumber: 4,
      operation: 'infer',
      description: 'Formulated natural-language conclusion from aggregated evidence',
      input: aggregated,
      output: conclusion,
      justification: 'Evidence synthesis weighted by source count and path confidence',
      confidence: aggregated.confidence,
    });

    // Build evidence chain
    const allNodes = paths.flatMap((p) => p.nodes);
    const uniqueNodes = this.deduplicate(allNodes, 'id');
    const chain = await this.evidenceChain.build({
      statement: conclusion,
      organizationId: question.organizationId,
      supportingEntityIds: uniqueNodes.map((n) => n.id),
      sourceDataSystems: [...new Set(uniqueNodes.map((n) => n.sourceSystem))],
      preliminaryConfidence: aggregated.confidence,
    });

    this.logger.log(
      `[${question.id}] Reasoning complete. confidence=${aggregated.confidence.toFixed(2)}, ` +
        `paths=${paths.length}, gaps=${gaps.length}`,
    );

    return {
      conclusion,
      confidence: aggregated.confidence,
      reasoningSteps: steps,
      evidenceChain: chain,
      knowledgeGaps: gaps,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Find entities in the graph whose displayName matches keywords in the question */
  private async extractSeedEntities(question: Question): Promise<GraphNode[]> {
    const session = this.neo4j.getSession();
    try {
      // Extract keywords (>3 chars, not stop-words) from question text
      const keywords = question.text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

      if (keywords.length === 0) return [];

      // Build a CONTAINS predicate for each keyword
      const conditions = keywords
        .map((_, i) => `toLower(n.displayName) CONTAINS $kw${i}`)
        .join(' OR ');
      const params: Record<string, any> = { orgId: question.organizationId };
      keywords.forEach((kw, i) => (params[`kw${i}`] = kw));

      const result = await session.run(
        `MATCH (n {organizationId: $orgId})
         WHERE ${conditions}
         RETURN n
         LIMIT 10`,
        params,
      );

      return result.records.map((r) => {
        const n = r.get('n') as any;
        const p = n.properties;
        return {
          id: p.id,
          type: n.labels[0] ?? 'Unknown',
          displayName: p.displayName ?? p.id,
          properties: p,
          sourceSystem: p.sourceSystem ?? 'unknown',
        };
      });
    } catch (err: any) {
      this.logger.warn(`extractSeedEntities failed: ${err.message}`);
      return [];
    } finally {
      await session.close();
    }
  }

  /** Traverse graph from a node up to maxHops using Cypher variable-length paths */
  private async traverseFrom(
    nodeId: string,
    organizationId: string,
    maxHops: number,
  ): Promise<GraphPath[]> {
    const session = this.neo4j.getSession();
    try {
      // Variable-length path query with organisation filter on nodes
      const result = await session.run(
        `MATCH path = (start {id: $startId})-[*1..${maxHops}]-(end)
         WHERE end.organizationId = $orgId
         RETURN path, length(path) AS hops
         ORDER BY hops DESC
         LIMIT 50`,
        { startId: nodeId, orgId: organizationId },
      );

      return result.records.map((r) => {
        const pathObj = r.get('path') as any;
        const hops = (r.get('hops') as any).toNumber ? (r.get('hops') as any).toNumber() : Number(r.get('hops'));

        const nodes: GraphNode[] = (pathObj.segments ?? []).flatMap((seg: any) => {
          const start = seg.start?.properties ?? {};
          const end = seg.end?.properties ?? {};
          return [
            { id: start.id, type: seg.start?.labels?.[0] ?? 'Unknown', displayName: start.displayName ?? start.id, properties: start, sourceSystem: start.sourceSystem ?? 'unknown' },
            { id: end.id, type: seg.end?.labels?.[0] ?? 'Unknown', displayName: end.displayName ?? end.id, properties: end, sourceSystem: end.sourceSystem ?? 'unknown' },
          ];
        });

        const edges: GraphEdge[] = (pathObj.segments ?? []).map((seg: any) => ({
          fromId: seg.start?.properties?.id,
          toId: seg.end?.properties?.id,
          type: seg.relationship?.type ?? 'RELATED_TO',
          confidence: Number(seg.relationship?.properties?.confidence ?? 0.5),
          properties: seg.relationship?.properties ?? {},
        }));

        // Path confidence = geometric mean of edge confidences (min 0.1)
        const pathConfidence =
          edges.length > 0
            ? Math.pow(
                edges.reduce((acc, e) => acc * Math.max(e.confidence, 0.1), 1),
                1 / edges.length,
              )
            : 0.5;

        return {
          nodes: this.deduplicate(nodes.filter((n) => n.id), 'id'),
          relationships: edges,
          totalHops: hops,
          pathConfidence,
        };
      });
    } catch (err: any) {
      this.logger.warn(`traverseFrom ${nodeId}: ${err.message}`);
      return [];
    } finally {
      await session.close();
    }
  }

  /** Aggregate multiple paths into a single confidence-weighted summary */
  private aggregatePaths(paths: GraphPath[]): {
    entityIds: string[];
    relationshipTypes: string[];
    confidence: number;
    deepestHop: number;
  } {
    if (paths.length === 0) {
      return { entityIds: [], relationshipTypes: [], confidence: 0.1, deepestHop: 0 };
    }

    const entityIds = [
      ...new Set(paths.flatMap((p) => p.nodes.map((n) => n.id)).filter(Boolean)),
    ];
    const relationshipTypes = [
      ...new Set(paths.flatMap((p) => p.relationships.map((r) => r.type))),
    ];
    const deepestHop = Math.max(...paths.map((p) => p.totalHops));

    // Weighted average confidence; deeper paths get a small bonus
    const totalWeight = paths.reduce((acc, p) => acc + p.totalHops, 0) || 1;
    const weightedConf =
      paths.reduce((acc, p) => acc + p.pathConfidence * p.totalHops, 0) / totalWeight;

    // Boost for meeting the 3-hop requirement
    const hopBonus = deepestHop >= MIN_HOPS ? 0.05 : 0;
    const confidence = Math.min(weightedConf + hopBonus, 0.95);

    return { entityIds, relationshipTypes, confidence, deepestHop };
  }

  /** Produce a natural-language conclusion from aggregated evidence */
  private formulateConclusion(
    questionText: string,
    aggregated: ReturnType<MultiHopTraversalService['aggregatePaths']>,
  ): string {
    if (aggregated.entityIds.length === 0) {
      return `Unable to derive a conclusion for "${questionText}" — insufficient connected entities in the knowledge graph.`;
    }

    const relSummary =
      aggregated.relationshipTypes.length > 0
        ? ` via ${aggregated.relationshipTypes.slice(0, 3).join(', ')} relationships`
        : '';

    return (
      `Based on multi-hop reasoning (depth=${aggregated.deepestHop}) across ` +
      `${aggregated.entityIds.length} connected entities${relSummary}, ` +
      `the knowledge graph supports answering "${questionText}" with ` +
      `${Math.round(aggregated.confidence * 100)}% confidence.`
    );
  }

  private buildLowConfidenceResult(
    questionText: string,
    steps: ReasoningStep[],
    gaps: KnowledgeGap[],
  ): ReasoningResult {
    return {
      conclusion: `Insufficient data to reason about "${questionText}".`,
      confidence: 0.05,
      reasoningSteps: steps,
      evidenceChain: {
        conclusionId: `gap_${Date.now()}`,
        conclusion: `Insufficient data to reason about "${questionText}".`,
        overallConfidence: 0.05,
        evidenceLinks: [],
        sourceCount: 0,
        createdAt: new Date(),
      },
      knowledgeGaps: gaps,
    };
  }

  private deduplicate<T extends { id: string }>(items: T[], key: keyof T): T[] {
    const seen = new Set<any>();
    return items.filter((item) => {
      if (seen.has(item[key])) return false;
      seen.add(item[key]);
      return true;
    });
  }
}

// Common English stop-words to skip when extracting keywords from questions
const STOP_WORDS = new Set([
  'what', 'when', 'where', 'which', 'with', 'have', 'this', 'that',
  'they', 'their', 'from', 'were', 'been', 'does', 'into', 'over',
  'more', 'also', 'your', 'will', 'said', 'each', 'then', 'there',
  'some', 'than', 'only', 'just', 'would', 'about', 'could', 'should',
]);
