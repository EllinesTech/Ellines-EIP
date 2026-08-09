/**
 * Knowledge Gap Service
 *
 * Detects and explains gaps in the knowledge graph that limit reasoning quality,
 * and provides actionable suggestions for filling those gaps.
 *
 * Requirement 2.8: WHEN reasoning fails or confidence is low, explain knowledge gaps
 */

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jProvider } from '../knowledge-graph/neo4j.provider';
import { KnowledgeGap, ReasoningResult } from './reasoning.interfaces';

/** Confidence threshold below which we consider reasoning "low confidence" */
const LOW_CONFIDENCE_THRESHOLD = 0.5;

@Injectable()
export class KnowledgeGapService {
  private readonly logger = new Logger(KnowledgeGapService.name);

  constructor(private readonly neo4j: Neo4jProvider) {}

  /**
   * Analyse a completed reasoning result and augment its knowledge gaps list
   * with any gaps detectable from the graph's current state.
   *
   * Requirement 2.8
   */
  async analyseResult(result: ReasoningResult, organizationId: string): Promise<KnowledgeGap[]> {
    const gaps: KnowledgeGap[] = [...result.knowledgeGaps];

    // Low-confidence check
    if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
      gaps.push(
        this.create(
          `Overall reasoning confidence is ${(result.confidence * 100).toFixed(0)}%, ` +
            `which is below the acceptable threshold of ${LOW_CONFIDENCE_THRESHOLD * 100}%.`,
          {
            impactOnReasoning: result.confidence < 0.25 ? 'critical' : 'major',
            suggestion:
              'Ingest more data from connected Systems of Record to improve graph coverage. ' +
              'Ensure entity extraction is running on all active connectors.',
          },
        ),
      );
    }

    // Detect structural gaps in the graph
    const structuralGaps = await this.detectStructuralGaps(organizationId);
    gaps.push(...structuralGaps);

    if (gaps.length > 0) {
      this.logger.log(
        `Knowledge gap analysis: ${gaps.length} gap(s) detected for org=${organizationId}`,
      );
    }

    return gaps;
  }

  /**
   * Detect structural gaps in the knowledge graph:
   * - Missing entity types
   * - Isolated nodes (no relationships)
   * - Sparse multi-hop connectivity
   */
  async detectStructuralGaps(organizationId: string): Promise<KnowledgeGap[]> {
    const gaps: KnowledgeGap[] = [];

    const session = this.neo4j.getSession();
    try {
      // 1. Check which entity types are present
      const typeResult = await session.run(
        `MATCH (n {organizationId: $orgId})
         RETURN DISTINCT labels(n) AS labels, count(n) AS cnt
         LIMIT 20`,
        { orgId: organizationId },
      );

      const presentTypes = new Set<string>();
      typeResult.records.forEach((r) => {
        const labels = r.get('labels') as string[];
        labels.forEach((l) => presentTypes.add(l));
      });

      const expectedTypes = ['Person', 'Product', 'Location', 'Event', 'Document'];
      const missingTypes = expectedTypes.filter((t) => !presentTypes.has(t));

      if (missingTypes.length > 0) {
        gaps.push(
          this.create(
            `The knowledge graph is missing entity types: ${missingTypes.join(', ')}.`,
            {
              missingEntityTypes: missingTypes,
              impactOnReasoning: missingTypes.length >= 3 ? 'critical' : 'major',
              suggestion: `Connect and ingest data from systems that contain ${missingTypes.join(', ')} records to enable richer reasoning.`,
            },
          ),
        );
      }

      // 2. Detect isolated nodes (entities with no relationships)
      const isolatedResult = await session.run(
        `MATCH (n {organizationId: $orgId})
         WHERE NOT (n)--()
         RETURN count(n) AS isolatedCount`,
        { orgId: organizationId },
      );

      const isolatedRecord = isolatedResult.records[0];
      const isolatedCount = isolatedRecord
        ? (isolatedRecord.get('isolatedCount') as any).toNumber?.() ?? Number(isolatedRecord.get('isolatedCount'))
        : 0;

      if (isolatedCount > 0) {
        gaps.push(
          this.create(
            `${isolatedCount} entities have no relationships and cannot participate in multi-hop reasoning.`,
            {
              impactOnReasoning: isolatedCount > 50 ? 'major' : 'minor',
              suggestion:
                'Run the relationship discovery service on recently ingested entities to establish connections.',
            },
          ),
        );
      }

      // 3. Check for low relationship density
      const densityResult = await session.run(
        `MATCH (n {organizationId: $orgId})
         WITH count(n) AS nodeCount
         MATCH ()-[r]-()
         WITH nodeCount, count(r) AS relCount
         RETURN nodeCount, relCount,
                CASE WHEN nodeCount > 0 THEN toFloat(relCount) / nodeCount ELSE 0 END AS density`,
        { orgId: organizationId },
      );

      const densityRecord = densityResult.records[0];
      if (densityRecord) {
        const density = Number(densityRecord.get('density'));
        const nodeCount = (densityRecord.get('nodeCount') as any).toNumber?.() ?? Number(densityRecord.get('nodeCount'));

        if (nodeCount > 10 && density < 1.5) {
          gaps.push(
            this.create(
              `Knowledge graph relationship density is low (${density.toFixed(2)} rels/node). ` +
                `Multi-hop reasoning is limited when entities have few connections.`,
              {
                impactOnReasoning: 'major',
                suggestion:
                  'Run relationship discovery on all entity pairs. Consider enabling co-occurrence analysis on event logs.',
              },
            ),
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`detectStructuralGaps failed: ${err.message}`);
      // Return a generic gap when Neo4j is not available
      gaps.push(
        this.create('Unable to assess knowledge graph structure — database may be unavailable.', {
          impactOnReasoning: 'critical',
          suggestion: 'Ensure Neo4j is running and the knowledge graph has been populated.',
        }),
      );
    } finally {
      await session.close();
    }

    return gaps;
  }

  /**
   * Factory method — create a KnowledgeGap with sensible defaults.
   */
  create(
    description: string,
    opts: {
      missingEntityTypes?: string[];
      missingSystems?: string[];
      impactOnReasoning: KnowledgeGap['impactOnReasoning'];
      suggestion: string;
    },
  ): KnowledgeGap {
    return {
      id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description,
      missingEntityTypes: opts.missingEntityTypes,
      missingSystems: opts.missingSystems,
      impactOnReasoning: opts.impactOnReasoning,
      suggestion: opts.suggestion,
    };
  }
}
