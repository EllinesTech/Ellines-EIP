/**
 * Evidence Chain Service
 *
 * Builds confidence-scored evidence chains for all reasoning conclusions.
 *
 * Requirement 2.6: Provide confidence scores and evidence chains for all reasoning conclusions
 */

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jProvider } from '../knowledge-graph/neo4j.provider';
import { Conclusion, EvidenceChain, EvidenceLink } from './reasoning.interfaces';

@Injectable()
export class EvidenceChainService {
  private readonly logger = new Logger(EvidenceChainService.name);

  constructor(private readonly neo4j: Neo4jProvider) {}

  /**
   * Build an evidence chain with confidence scoring for a conclusion.
   *
   * Requirement 2.6: Every conclusion gets an evidence chain with confidence score.
   */
  async build(conclusion: Conclusion): Promise<EvidenceChain> {
    this.logger.log(
      `Building evidence chain for conclusion (${conclusion.supportingEntityIds.length} entities)`,
    );

    // Fetch entity data from Neo4j
    const entityLinks = await this.fetchEntityLinks(
      conclusion.supportingEntityIds,
      conclusion.organizationId,
    );

    // Score the chain
    const overallConfidence = this.computeOverallConfidence(
      conclusion.preliminaryConfidence,
      entityLinks,
      conclusion.sourceDataSystems,
    );

    const chain: EvidenceChain = {
      conclusionId: `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conclusion: conclusion.statement,
      overallConfidence,
      evidenceLinks: entityLinks,
      sourceCount: new Set(entityLinks.map((e) => e.sourceSystem)).size,
      createdAt: new Date(),
    };

    this.logger.log(
      `Evidence chain built: ${entityLinks.length} links, ` +
        `confidence=${overallConfidence.toFixed(2)}, ` +
        `sources=${chain.sourceCount}`,
    );

    return chain;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Fetch entities from the knowledge graph and convert to EvidenceLink objects.
   * Falls back gracefully when Neo4j is unavailable (e.g., test environments).
   */
  private async fetchEntityLinks(
    entityIds: string[],
    organizationId: string,
  ): Promise<EvidenceLink[]> {
    if (entityIds.length === 0) return [];

    const session = this.neo4j.getSession();
    try {
      const result = await session.run(
        `MATCH (n {organizationId: $orgId})
         WHERE n.id IN $ids
         RETURN n
         LIMIT 100`,
        { orgId: organizationId, ids: entityIds },
      );

      return result.records.map((r) => {
        const node = r.get('n') as any;
        const p = node.properties;
        return {
          entityId: p.id ?? '',
          entityType: node.labels?.[0] ?? 'Unknown',
          displayName: p.displayName ?? p.id ?? 'Unknown',
          supportStrength: Number(p.confidence ?? 0.5),
          sourceSystem: p.sourceSystem ?? 'unknown',
          dataPoint: p.sourceEntityId ? `Source record: ${p.sourceEntityId}` : undefined,
        };
      });
    } catch (err: any) {
      this.logger.warn(`fetchEntityLinks failed: ${err.message} — building synthetic links`);
      // Fallback: create synthetic evidence links from IDs
      return entityIds.map((id) => ({
        entityId: id,
        entityType: 'Unknown',
        displayName: id,
        supportStrength: 0.5,
        sourceSystem: 'unknown',
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Compute the overall confidence of an evidence chain.
   *
   * Algorithm:
   * 1. Start from the preliminary confidence.
   * 2. Apply a source diversity bonus (more distinct sources = higher confidence).
   * 3. Apply an evidence density bonus (more evidence links = higher confidence).
   * 4. Clip to [0.05, 0.97].
   */
  private computeOverallConfidence(
    preliminary: number,
    links: EvidenceLink[],
    sourceDataSystems: string[],
  ): number {
    if (links.length === 0) return Math.max(preliminary * 0.5, 0.05);

    // Source diversity: 0 bonus for 1 source, +0.05 per additional source (max +0.2)
    const uniqueSources = new Set([
      ...links.map((l) => l.sourceSystem),
      ...sourceDataSystems,
    ]).size;
    const sourceBonus = Math.min((uniqueSources - 1) * 0.05, 0.2);

    // Evidence density: log-scale bonus for number of evidence links
    const densityBonus = Math.min(Math.log10(links.length + 1) * 0.1, 0.15);

    // Average support strength of individual links
    const avgStrength = links.reduce((acc, l) => acc + l.supportStrength, 0) / links.length;

    // Weighted combination
    const combined = preliminary * 0.5 + avgStrength * 0.3 + (sourceBonus + densityBonus) * 0.2;

    return Math.min(Math.max(combined, 0.05), 0.97);
  }
}
