/**
 * Citation and Drill-Down Link Generator
 * Generates citations to source records with drill-down links
 */

import { QueryResult } from './result-synthesizer';

export interface Citation {
  id: string;
  sourceConnector: string;
  recordId: string;
  recordName: string;
  recordType: string;
  relevanceScore: number;
  matchedFields: string[];
  drillDownLink: DrillDownLink;
}

export interface DrillDownLink {
  type: 'record_detail' | 'record_list' | 'report' | 'dashboard' | 'related_entities';
  url: string;
  label: string;
  icon?: string;
  description?: string;
  parameters?: Record<string, any>;
}

export interface CitationContext {
  datasetName: string;
  timeRange?: { start: Date; end: Date };
  filters?: Record<string, any>;
  aggregationLevel?: 'detail' | 'summary' | 'executive';
}

export interface AnnotatedResult {
  content: string;
  citations: Array<{
    startOffset: number;
    endOffset: number;
    citationId: string;
  }>;
}

export interface DrillDownPath {
  steps: DrillDownStep[];
  totalSteps: number;
}

export interface DrillDownStep {
  level: number;
  entity: string;
  entityId: string;
  entityType: string;
  drillDownLink: DrillDownLink;
  childEntities?: DrillDownStep[];
}

export class CitationGenerator {
  /**
   * Generate citations from query results
   */
  generateCitations(results: QueryResult[], context: CitationContext): Citation[] {
    const citations: Citation[] = [];

    for (const result of results) {
      for (let i = 0; i < result.data.length; i++) {
        const record = result.data[i];
        const citation = this.createCitation(record, result.connectorName, i, context);
        if (citation) {
          citations.push(citation);
        }
      }
    }

    // Sort by relevance
    return citations.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Annotate text with inline citations
   */
  annotateWithCitations(text: string, citations: Citation[]): AnnotatedResult {
    const annotated = { content: text, citations: [] as Array<{
      startOffset: number;
      endOffset: number;
      citationId: string;
    }> };

    if (citations.length === 0) {
      return annotated;
    }

    // Simple citation injection - mark key phrases with citations
    const topCitations = citations.slice(0, 5);
    let offset = 0;

    for (const citation of topCitations) {
      // Find mention of record in text
      const searchTerms = [citation.recordName, citation.recordId].filter(t => t);
      for (const term of searchTerms) {
        const index = text.toLowerCase().indexOf(term.toLowerCase(), offset);
        if (index !== -1) {
          annotated.citations.push({
            startOffset: index,
            endOffset: index + term.length,
            citationId: citation.id,
          });
          offset = index + term.length;
          break;
        }
      }
    }

    return annotated;
  }

  /**
   * Generate drill-down paths for hierarchical navigation
   */
  generateDrillDownPath(
    rootEntity: { id: string; name: string; type: string },
    relatedRecords: any[],
    context: CitationContext,
  ): DrillDownPath {
    const steps: DrillDownStep[] = [];

    // Root level
    const rootStep: DrillDownStep = {
      level: 0,
      entity: rootEntity.name,
      entityId: rootEntity.id,
      entityType: rootEntity.type,
      drillDownLink: this.createDrillDownLink('record_detail', rootEntity, 0, context),
      childEntities: [],
    };
    steps.push(rootStep);

    // Child levels (up to 3 levels deep)
    let currentLevel = rootStep;
    for (let level = 1; level <= 2 && relatedRecords.length > 0; level++) {
      const levelRecords = relatedRecords.filter((r: any) => r._level === level);
      
      for (const record of levelRecords.slice(0, 3)) {
        const step: DrillDownStep = {
          level,
          entity: record.name || record.id,
          entityId: record.id,
          entityType: record.type || 'related',
          drillDownLink: this.createDrillDownLink('record_detail', record, level, context),
        };
        
        if (!currentLevel.childEntities) {
          currentLevel.childEntities = [];
        }
        currentLevel.childEntities.push(step);
        currentLevel = step;
      }
    }

    return {
      steps,
      totalSteps: steps.length,
    };
  }

  /**
   * Create drill-down links for a record
   */
  createDrillDownLinks(record: any, connectorName: string, context: CitationContext): DrillDownLink[] {
    const links: DrillDownLink[] = [];

    // Detail view link
    links.push({
      type: 'record_detail',
      url: `/data/${connectorName}/${record.id}`,
      label: 'View Full Record',
      icon: 'external-link',
      description: `Open the complete record for ${record.name || record.id}`,
    });

    // Related records link
    if (record.type) {
      links.push({
        type: 'related_entities',
        url: `/data/${connectorName}?type=${record.type}&related_to=${record.id}`,
        label: 'Related Records',
        icon: 'link',
        description: `Show records related to this ${record.type}`,
      });
    }

    // List view link (same entity type)
    if (record.type) {
      links.push({
        type: 'record_list',
        url: `/data/${connectorName}?type=${record.type}`,
        label: `All ${record.type}s`,
        icon: 'list',
        description: `Browse all records of this type`,
      });
    }

    // Dashboard link if available
    if (this.hasDashboard(record)) {
      links.push({
        type: 'dashboard',
        url: `/dashboards/${connectorName}/${record.id}`,
        label: 'Analytics Dashboard',
        icon: 'chart-bar',
        description: `View analytics and metrics for this record`,
      });
    }

    // Report link if available
    if (this.hasReport(record)) {
      links.push({
        type: 'report',
        url: `/reports/${connectorName}/${record.id}`,
        label: 'Generate Report',
        icon: 'file-pdf',
        description: `Generate a comprehensive report`,
      });
    }

    return links;
  }

  /**
   * Create a reference-style citation entry
   */
  createReferenceCitation(
    citation: Citation,
    index: number,
  ): {
    reference: string;
    full: string;
  } {
    const ref = `[${index}]`;
    const full = `[${index}] ${citation.recordName} (${citation.recordType}) from ${citation.sourceConnector} ` +
                 `[Relevance: ${(citation.relevanceScore * 100).toFixed(0)}%]`;

    return { reference: ref, full };
  }

  /**
   * Generate a bibliography for all citations
   */
  generateBibliography(citations: Citation[]): string {
    if (citations.length === 0) {
      return '';
    }

    const lines = ['## References', ''];
    
    // Group by source
    const bySource = new Map<string, Citation[]>();
    for (const citation of citations) {
      if (!bySource.has(citation.sourceConnector)) {
        bySource.set(citation.sourceConnector, []);
      }
      bySource.get(citation.sourceConnector)!.push(citation);
    }

    // Generate bibliography entries
    let index = 1;
    for (const [source, sourceCitations] of bySource) {
      lines.push(`### ${source}`);
      for (const citation of sourceCitations.slice(0, 10)) {
        lines.push(
          `${index}. **${citation.recordName}** (${citation.recordType}) - ID: ${citation.recordId}`,
        );
        lines.push(`   - Confidence: ${(citation.relevanceScore * 100).toFixed(0)}%`);
        lines.push(`   - Fields: ${citation.matchedFields.join(', ')}`);
        lines.push('');
        index++;
      }
    }

    return lines.join('\n');
  }

  private createCitation(
    record: any,
    connectorName: string,
    index: number,
    context: CitationContext,
  ): Citation | null {
    if (!record) return null;

    const recordId = record.id || record._id || `record_${index}`;
    const recordName = record.name || record.title || String(recordId).substring(0, 50);
    const recordType = record.type || record.entity_type || 'record';

    // Extract matched fields (fields that might have been queried)
    const matchedFields = this.extractMatchedFields(record);

    // Calculate relevance score
    const relevanceScore = this.calculateRelevanceScore(record, matchedFields);

    const citation: Citation = {
      id: `cit_${connectorName}_${recordId}_${index}`,
      sourceConnector: connectorName,
      recordId,
      recordName,
      recordType,
      relevanceScore,
      matchedFields,
      drillDownLink: this.createDrillDownLink('record_detail', record, 0, context),
    };

    return citation;
  }

  private createDrillDownLink(
    type: DrillDownLink['type'],
    record: any,
    level: number,
    context: CitationContext,
  ): DrillDownLink {
    const recordId = record.id || record._id;
    const baseUrl = `/data/${record.connector || context.datasetName}`;

    let url = baseUrl;
    let label = 'View Record';
    let description = 'Open this record for detailed view';

    if (type === 'record_detail') {
      url = `${baseUrl}/${recordId}`;
      label = 'View Full Record';
      description = `Open the complete record for ${record.name || recordId}`;
    } else if (type === 'record_list') {
      url = `${baseUrl}?type=${record.type}`;
      label = `All ${record.type}s`;
      description = 'Show all records of this type';
    } else if (type === 'related_entities') {
      url = `${baseUrl}?related_to=${recordId}`;
      label = 'Related Records';
      description = 'Show records related to this entity';
    } else if (type === 'dashboard') {
      url = `/dashboards/${record.type}/${recordId}`;
      label = 'Analytics Dashboard';
      description = 'View analytics and metrics';
    } else if (type === 'report') {
      url = `/reports/${record.type}/${recordId}`;
      label = 'Generate Report';
      description = 'Create a comprehensive report';
    }

    return {
      type,
      url,
      label,
      icon: this.getIconForType(type),
      description,
      parameters: {
        recordId,
        recordType: record.type,
        level,
        timeRange: context.timeRange,
        filters: context.filters,
      },
    };
  }

  private extractMatchedFields(record: any): string[] {
    const fields: string[] = [];
    
    if (!record) return fields;

    // Common important fields
    const importantFields = ['id', 'name', 'title', 'email', 'phone', 'status', 'type', 'category'];
    
    for (const field of importantFields) {
      if (field in record && record[field]) {
        fields.push(field);
      }
    }

    // Add up to 5 non-null fields
    for (const key of Object.keys(record).slice(0, 10)) {
      if (record[key] && !fields.includes(key) && !key.startsWith('_')) {
        fields.push(key);
      }
      if (fields.length >= 5) break;
    }

    return fields;
  }

  private calculateRelevanceScore(record: any, matchedFields: string[]): number {
    let score = 0.5; // Base score

    // Boost for matched fields
    score += Math.min(matchedFields.length * 0.1, 0.3);

    // Boost for explicit relevance/confidence field
    if (record.relevance !== undefined && typeof record.relevance === 'number') {
      score = record.relevance;
    } else if (record.confidence !== undefined && typeof record.confidence === 'number') {
      score = record.confidence;
    } else if (record.score !== undefined && typeof record.score === 'number') {
      score = record.score;
    }

    // Ensure score is in range
    return Math.max(0, Math.min(score, 1));
  }

  private getIconForType(type: DrillDownLink['type']): string {
    const iconMap: Record<DrillDownLink['type'], string> = {
      record_detail: 'external-link',
      record_list: 'list',
      report: 'file-pdf',
      dashboard: 'chart-bar',
      related_entities: 'link',
    };
    return iconMap[type] || 'link';
  }

  private hasDashboard(record: any): boolean {
    // Check if record type has an associated dashboard
    const dashboardTypes = ['customer', 'product', 'employee', 'department', 'region'];
    return dashboardTypes.includes((record.type || '').toLowerCase());
  }

  private hasReport(record: any): boolean {
    // Check if record type supports report generation
    const reportableTypes = ['customer', 'product', 'project', 'campaign', 'contract'];
    return reportableTypes.includes((record.type || '').toLowerCase());
  }
}
