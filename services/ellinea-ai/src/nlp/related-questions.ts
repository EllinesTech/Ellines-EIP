/**
 * Related Questions Suggester
 * Generates follow-up question suggestions from knowledge graph
 */

import { ParsedQuery } from './query-parser';
import { ConversationContext } from './conversation-context';

export interface RelatedQuestion {
  id: string;
  question: string;
  type: 'follow_up' | 'alternative' | 'deeper_dive' | 'comparison' | 'trend';
  relevanceScore: number;
  expectedContext?: Record<string, any>;
}

export interface QuestionSuggestions {
  questions: RelatedQuestion[];
  metadata: {
    baseQuestion: string;
    generatedAt: Date;
    suggestionsCount: number;
  };
}

export interface KnowledgeGraphEntity {
  id: string;
  name: string;
  type: string;
  relationships: {
    type: string;
    targetId: string;
    targetName: string;
    strength: number;
  }[];
}

export class RelatedQuestionsSuggester {
  private knowledgeGraph: Map<string, KnowledgeGraphEntity> = new Map();

  /**
   * Register entity in knowledge graph
   */
  registerEntity(entity: KnowledgeGraphEntity): void {
    this.knowledgeGraph.set(entity.id, entity);
  }

  /**
   * Generate follow-up questions from current query
   */
  suggestRelatedQuestions(
    query: ParsedQuery,
    context: ConversationContext,
    limit: number = 5,
  ): QuestionSuggestions {
    const suggestions: RelatedQuestion[] = [];

    // Generate follow-up questions
    suggestions.push(...this.generateFollowUpQuestions(query));

    // Generate alternative angle questions
    suggestions.push(...this.generateAlternativeQuestions(query));

    // Generate deeper dive questions
    suggestions.push(...this.generateDeeperDiveQuestions(query));

    // Generate comparison questions
    suggestions.push(...this.generateComparisonQuestions(query, context));

    // Generate trend questions
    suggestions.push(...this.generateTrendQuestions(query));

    // Sort by relevance and limit
    suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const filtered = suggestions.slice(0, limit);

    return {
      questions: filtered,
      metadata: {
        baseQuestion: query.originalQuery,
        generatedAt: new Date(),
        suggestionsCount: filtered.length,
      },
    };
  }

  private generateFollowUpQuestions(query: ParsedQuery): RelatedQuestion[] {
    const questions: RelatedQuestion[] = [];

    // Follow-up based on entities
    for (const entity of query.entities.slice(0, 2)) {
      questions.push({
        id: `follow_${entity.value}_details`,
        question: `What are the details for ${entity.value}?`,
        type: 'follow_up',
        relevanceScore: 0.85,
        expectedContext: { focusEntity: entity.value },
      });

      questions.push({
        id: `follow_${entity.value}_recent`,
        question: `What's the most recent activity for ${entity.value}?`,
        type: 'follow_up',
        relevanceScore: 0.8,
      });
    }

    // Follow-up based on constraints
    if (query.constraints.length > 0) {
      const constraint = query.constraints[0];
      questions.push({
        id: `follow_constraint_${constraint.field}`,
        question: `How does ${constraint.field} trend over time?`,
        type: 'follow_up',
        relevanceScore: 0.78,
      });
    }

    // Follow-up based on aggregation
    if (query.aggregation) {
      questions.push({
        id: `follow_breakdown`,
        question: `Can you break down the results by category?`,
        type: 'follow_up',
        relevanceScore: 0.75,
      });
    }

    return questions;
  }

  private generateAlternativeQuestions(query: ParsedQuery): RelatedQuestion[] {
    const questions: RelatedQuestion[] = [];

    // Alternative intent questions
    if (query.intent.type === 'search') {
      questions.push({
        id: `alt_analyze`,
        question: `Can you analyze ${query.entities[0]?.value || 'this data'}?`,
        type: 'alternative',
        relevanceScore: 0.7,
      });
    }

    if (query.intent.type === 'analysis') {
      questions.push({
        id: `alt_predict`,
        question: `What's the forecast for ${query.entities[0]?.value || 'this metric'}?`,
        type: 'alternative',
        relevanceScore: 0.72,
      });
    }

    // Alternative entity focus
    if (query.entities.length > 1) {
      for (const entity of query.entities.slice(1, 3)) {
        questions.push({
          id: `alt_entity_${entity.value}`,
          question: `How does ${entity.value} compare to ${query.entities[0].value}?`,
          type: 'alternative',
          relevanceScore: 0.68,
        });
      }
    }

    return questions;
  }

  private generateDeeperDiveQuestions(query: ParsedQuery): RelatedQuestion[] {
    const questions: RelatedQuestion[] = [];

    if (query.entities.length > 0) {
      const entity = query.entities[0];

      // Drill into related entities from knowledge graph
      const graphEntity = this.knowledgeGraph.get(entity.value);
      if (graphEntity) {
        for (const rel of graphEntity.relationships.slice(0, 2)) {
          questions.push({
            id: `dive_${rel.targetId}`,
            question: `How is ${rel.targetName} related to ${entity.value} in the context of ${rel.type}?`,
            type: 'deeper_dive',
            relevanceScore: 0.65 + rel.strength * 0.2,
          });
        }
      }

      // Root cause analysis
      if (query.constraints.length > 0) {
        questions.push({
          id: `dive_root_cause`,
          question: `What are the root causes behind the ${query.constraints[0].field} constraint?`,
          type: 'deeper_dive',
          relevanceScore: 0.7,
        });
      }

      // Impact analysis
      questions.push({
        id: `dive_impact`,
        question: `What's the business impact of changes to ${entity.value}?`,
        type: 'deeper_dive',
        relevanceScore: 0.68,
      });
    }

    return questions;
  }

  private generateComparisonQuestions(query: ParsedQuery, context: ConversationContext): RelatedQuestion[] {
    const questions: RelatedQuestion[] = [];

    // Compare with previous results in context
    if (context.inferredContext.previousEntities.length > 0) {
      const prevEntity = context.inferredContext.previousEntities[0];
      if (query.entities.length > 0 && query.entities[0].value !== prevEntity) {
        questions.push({
          id: `compare_previous`,
          question: `How does ${query.entities[0].value} compare to ${prevEntity}?`,
          type: 'comparison',
          relevanceScore: 0.75,
        });
      }
    }

    // Compare across different aggregations
    if (query.aggregation) {
      const otherAggs = ['average', 'median', 'max', 'min', 'count'].filter(a => a !== query.aggregation);
      for (const agg of otherAggs.slice(0, 2)) {
        questions.push({
          id: `compare_agg_${agg}`,
          question: `What if we look at ${agg} instead of ${query.aggregation}?`,
          type: 'comparison',
          relevanceScore: 0.65,
        });
      }
    }

    // Year-over-year or period comparison
    if (query.timeframe) {
      questions.push({
        id: `compare_period`,
        question: `How does this compare to the same period last year?`,
        type: 'comparison',
        relevanceScore: 0.7,
      });
    }

    return questions;
  }

  private generateTrendQuestions(query: ParsedQuery): RelatedQuestion[] {
    const questions: RelatedQuestion[] = [];

    // Trend over different timeframes
    const timeframes = [
      { name: 'daily', label: 'day' },
      { name: 'weekly', label: 'week' },
      { name: 'monthly', label: 'month' },
      { name: 'quarterly', label: 'quarter' },
    ];

    for (const tf of timeframes.slice(0, 2)) {
      questions.push({
        id: `trend_${tf.name}`,
        question: `What's the ${tf.name} trend for ${query.entities[0]?.value || 'this metric'}?`,
        type: 'trend',
        relevanceScore: 0.7,
      });
    }

    // Forecast questions
    questions.push({
      id: `trend_forecast`,
      question: `What's the forecast for the next quarter?`,
      type: 'trend',
      relevanceScore: 0.72,
    });

    // Volatility questions
    questions.push({
      id: `trend_volatility`,
      question: `How stable or volatile is this trend?`,
      type: 'trend',
      relevanceScore: 0.65,
    });

    return questions;
  }

  /**
   * Get suggestions based on conversation history
   */
  suggestFromHistory(context: ConversationContext, limit: number = 3): RelatedQuestion[] {
    const questions: RelatedQuestion[] = [];

    // Find unanswered questions from history
    for (let i = context.messages.length - 1; i >= Math.max(0, context.messages.length - 5); i--) {
      const msg = context.messages[i];
      if (msg.role === 'user' && msg.parsedQuery) {
        // If this question had few results, suggest refinements
        questions.push({
          id: `history_refine_${i}`,
          question: `Would you like to refine your earlier question about ${msg.parsedQuery.entities[0]?.value || 'that topic'}?`,
          type: 'follow_up',
          relevanceScore: 0.6,
        });
      }
    }

    return questions.slice(0, limit);
  }
}
