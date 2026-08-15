import { Injectable } from '@nestjs/common';
import type { DataSourceCitation } from './types';

/**
 * DataSourceCitationTracker
 * Tracks data sources used in AI reasoning with specific record references
 * Requirement 23.2: Data source citation with specific record references
 */
@Injectable()
export class DataSourceCitationTracker {
  private citations: Map<string, DataSourceCitation[]> = new Map();

  /**
   * Add a citation for a specific record used in reasoning
   */
  addCitation(
    conclusionId: string,
    citation: DataSourceCitation,
  ): void {
    if (!this.citations.has(conclusionId)) {
      this.citations.set(conclusionId, []);
    }
    this.citations.get(conclusionId)!.push(citation);
  }

  /**
   * Add multiple citations at once
   */
  addCitations(
    conclusionId: string,
    citations: DataSourceCitation[],
  ): void {
    citations.forEach(c => this.addCitation(conclusionId, c));
  }

  /**
   * Get all citations for a conclusion
   */
  getCitations(conclusionId: string): DataSourceCitation[] {
    return this.citations.get(conclusionId) || [];
  }

  /**
   * Get citations filtered by source system
   */
  getCitationsBySource(
    conclusionId: string,
    source: string,
  ): DataSourceCitation[] {
    const all = this.getCitations(conclusionId);
    return all.filter(c => c.source === source);
  }

  /**
   * Remove duplicate citations (same source, table, recordId)
   */
  deduplicateCitations(conclusionId: string): void {
    const citations = this.getCitations(conclusionId);
    const seen = new Set<string>();
    const deduplicated: DataSourceCitation[] = [];

    for (const citation of citations) {
      const key = `${citation.source}:${citation.table || ''}:${citation.recordId}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(citation);
      }
    }

    this.citations.set(conclusionId, deduplicated);
  }

  /**
   * Get citation summary statistics
   */
  getCitationStats(conclusionId: string) {
    const citations = this.getCitations(conclusionId);
    const bySource = new Map<string, number>();
    let totalConfidence = 0;
    let highConfidenceCount = 0;

    for (const citation of citations) {
      bySource.set(citation.source, (bySource.get(citation.source) || 0) + 1);
      totalConfidence += citation.confidence;
      if (citation.confidence >= 80) {
        highConfidenceCount++;
      }
    }

    return {
      totalCitations: citations.length,
      uniqueSources: bySource.size,
      citationsBySource: Object.fromEntries(bySource),
      averageConfidence: citations.length ? totalConfidence / citations.length : 0,
      highConfidenceCitations: highConfidenceCount,
    };
  }

  /**
   * Generate citation narrative for display
   */
  generateCitationNarrative(conclusionId: string): string {
    const citations = this.getCitations(conclusionId);
    if (citations.length === 0) {
      return 'No specific sources cited.';
    }

    const bySource = new Map<string, DataSourceCitation[]>();
    for (const citation of citations) {
      if (!bySource.has(citation.source)) {
        bySource.set(citation.source, []);
      }
      bySource.get(citation.source)!.push(citation);
    }

    const parts: string[] = [];
    bySource.forEach((sourceCitations, source) => {
      const records = sourceCitations
        .map(c => `${c.recordName || c.recordId}${c.field ? ` (${c.field})` : ''}`)
        .join(', ');
      parts.push(`From ${source}: ${records}`);
    });

    return `Based on: ${parts.join('; ')}`;
  }

  /**
   * Clear all citations
   */
  clearAll(): void {
    this.citations.clear();
  }

  /**
   * Clear citations for specific conclusion
   */
  clear(conclusionId: string): void {
    this.citations.delete(conclusionId);
  }
}
