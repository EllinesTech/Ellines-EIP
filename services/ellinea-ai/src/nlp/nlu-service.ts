/**
 * Natural Language Understanding Service
 * Orchestrates all NLU components for end-to-end query processing
 */

import { QueryParser, ParsedQuery } from './query-parser';
import { DisambiguationEngine, DisambiguationResult } from './disambiguation';
import { MultiSourceQueryGenerator, MultiSourceQuery, ConnectorQuery } from './multi-source-generator';
import { ResultSynthesizer, SynthesizedResult, QueryResult } from './result-synthesizer';
import { ConversationContextManager, ConversationContext } from './conversation-context';
import { RelatedQuestionsSuggester, RelatedQuestion } from './related-questions';
import { CitationGenerator, Citation, DrillDownLink, CitationContext } from './citation-generator';

export interface NLURequest {
  question: string;
  sessionId: string;
  userId: string;
  organizationId: string;
  context?: Record<string, any>;
}

export interface NLUResponse {
  answer: string;
  summary: string;
  keyFindings: string[];
  citations: Citation[];
  drillDownLinks: DrillDownLink[];
  relatedQuestions: RelatedQuestion[];
  confidenceScore: number;
  clarifyingQuestionsNeeded: boolean;
  clarifyingQuestions?: any[];
  metadata: {
    processingTime: number;
    parsedQuery: ParsedQuery;
    connectorCount: number;
  };
}

export class NLUService {
  private queryParser: QueryParser;
  private disambiguationEngine: DisambiguationEngine;
  private multiSourceGenerator: MultiSourceQueryGenerator;
  private resultSynthesizer: ResultSynthesizer;
  private contextManager: ConversationContextManager;
  private questionSuggester: RelatedQuestionsSuggester;
  private citationGenerator: CitationGenerator;

  constructor() {
    this.queryParser = new QueryParser();
    this.disambiguationEngine = new DisambiguationEngine();
    this.multiSourceGenerator = new MultiSourceQueryGenerator();
    this.resultSynthesizer = new ResultSynthesizer();
    this.contextManager = new ConversationContextManager();
    this.questionSuggester = new RelatedQuestionsSuggester();
    this.citationGenerator = new CitationGenerator();
  }

  /**
   * Process natural language query end-to-end
   */
  async processQuery(request: NLURequest): Promise<NLUResponse> {
    const startTime = Date.now();

    // Get or create conversation context
    const context = this.contextManager.getOrCreateContext(
      request.sessionId,
      request.userId,
      request.organizationId,
    );

    // Parse query
    const parsedQuery = this.queryParser.parse(request.question);

    // Check for ambiguity
    const disambiguation = this.disambiguationEngine.disambiguate(parsedQuery);

    // Add user message to context
    this.contextManager.addMessage(context, 'user', request.question, parsedQuery);

    // Enrich query with conversational context
    const enrichedQuery = this.contextManager.enrichQueryWithContext(context, parsedQuery);

    // If ambiguous, return clarifying questions
    if (disambiguation.isAmbiguous && disambiguation.clarifyingQuestions.length > 0) {
      const response: NLUResponse = {
        answer:
          'I found your question a bit ambiguous. Could you clarify the following to get better results?',
        summary: 'Clarification needed',
        keyFindings: disambiguation.clarifyingQuestions.map(q => q.question),
        citations: [],
        drillDownLinks: [],
        relatedQuestions: [],
        confidenceScore: disambiguation.ambiguityScore,
        clarifyingQuestionsNeeded: true,
        clarifyingQuestions: disambiguation.clarifyingQuestions,
        metadata: {
          processingTime: Date.now() - startTime,
          parsedQuery,
          connectorCount: 0,
        },
      };

      return response;
    }

    // Generate multi-source queries
    const multiSourceQuery = this.multiSourceGenerator.generateMultiSourceQuery(
      enrichedQuery.enriched,
    );

    // Simulate execution (in real system, would execute against actual connectors)
    const queryResults = this.simulateQueryExecution(multiSourceQuery);

    // Synthesize results
    const synthesizedResult = this.resultSynthesizer.synthesize(enrichedQuery.enriched, queryResults);

    // Generate citations
    const citationContext: CitationContext = {
      datasetName: 'enterprise-data',
      timeRange: enrichedQuery.enriched.timeframe
        ? { start: new Date(), end: new Date() }
        : undefined,
      filters: enrichedQuery.enriched.constraints.reduce(
        (acc, c) => {
          acc[c.field] = c.value;
          return acc;
        },
        {} as Record<string, any>,
      ),
    };

    const citations = this.citationGenerator.generateCitations(queryResults, citationContext);

    // Generate drill-down links
    const drillDownLinks: DrillDownLink[] = [];
    if (queryResults.length > 0 && queryResults[0].data.length > 0) {
      const drillDownPath = this.citationGenerator.generateDrillDownPath(
        {
          id: 'root',
          name: request.question,
          type: 'query_result',
        },
        queryResults[0].data.slice(0, 5).map((r: any) => ({
          id: r.id,
          name: r.name || r.title,
          type: r.type,
          _level: 1,
        })),
        citationContext,
      );

      drillDownLinks.push(
        ...drillDownPath.steps
          .flatMap(s => {
            const links = this.citationGenerator.createDrillDownLinks(
              { id: s.entityId, name: s.entity, type: s.entityType },
              citationContext.datasetName,
              citationContext,
            );
            return links;
          })
          .slice(0, 5),
      );
    }

    // Generate related questions
    const relatedQuestions = this.questionSuggester.suggestRelatedQuestions(
      enrichedQuery.enriched,
      context,
      3,
    ).questions;

    // Add assistant message to context
    this.contextManager.addMessage(context, 'assistant', synthesizedResult.narrative);

    // Calculate overall confidence
    const overallConfidence = Math.min(
      synthesizedResult.confidenceScore,
      1 - disambiguation.ambiguityScore * 0.1,
    );

    const processingTime = Date.now() - startTime;

    const response: NLUResponse = {
      answer: synthesizedResult.narrative,
      summary: synthesizedResult.summary,
      keyFindings: synthesizedResult.keyFindings,
      citations,
      drillDownLinks,
      relatedQuestions,
      confidenceScore: overallConfidence,
      clarifyingQuestionsNeeded: false,
      metadata: {
        processingTime,
        parsedQuery: enrichedQuery.enriched,
        connectorCount: multiSourceQuery.targetConnectors.length,
      },
    };

    return response;
  }

  /**
   * Handle user clarification to refined query
   */
  async applyClarification(
    request: NLURequest,
    clarificationId: string,
    selectedOption: string,
  ): Promise<NLUResponse> {
    // Re-parse with clarification applied
    const enhancedQuestion = `${request.question} [clarification: ${selectedOption}]`;
    return this.processQuery({
      ...request,
      question: enhancedQuestion,
    });
  }

  /**
   * Get conversation summary
   */
  getConversationSummary(sessionId: string): string {
    const context = this.contextManager.getOrCreateContext(sessionId, '', '');
    return this.contextManager.getContextSummary(context);
  }

  /**
   * Clear conversation history
   */
  clearConversationHistory(sessionId: string): void {
    this.contextManager.clearHistory(sessionId);
  }

  /**
   * Simulate query execution (in production, would call actual connectors)
   */
  private simulateQueryExecution(multiSourceQuery: MultiSourceQuery): QueryResult[] {
    const results: QueryResult[] = [];

    for (const connectorQuery of multiSourceQuery.targetConnectors) {
      // Generate mock data based on query
      const mockData = this.generateMockData(connectorQuery);

      results.push({
        connectorId: connectorQuery.connectorId,
        connectorName: connectorQuery.connectorName,
        data: mockData,
        metadata: {
          rowCount: mockData.length,
          executionTime: Math.random() * 1000,
          latency: Math.random() * 500,
        },
      });
    }

    return results;
  }

  /**
   * Generate mock data for demonstration
   */
  private generateMockData(connectorQuery: ConnectorQuery): any[] {
    const data = [];
    const recordCount = Math.floor(Math.random() * 20) + 5;

    for (let i = 0; i < recordCount; i++) {
      data.push({
        id: `record_${connectorQuery.connectorId}_${i}`,
        name: `Record ${i + 1}`,
        type: connectorQuery.connectorType,
        value: Math.floor(Math.random() * 10000),
        status: ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)],
        created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
        score: Math.random() * 100,
      });
    }

    return data;
  }

  /**
   * Register a knowledge graph entity for related questions
   */
  registerEntity(entity: any): void {
    this.questionSuggester.registerEntity(entity);
  }

  /**
   * Register a connector capability
   */
  registerConnector(connector: any): void {
    this.multiSourceGenerator.registerConnector(connector);
  }
}

export default NLUService;
