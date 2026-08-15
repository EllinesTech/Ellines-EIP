/**
 * Conversation Context Manager
 * Manages multi-turn dialogue state, history, and user preferences
 */

import { ParsedQuery } from './query-parser';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  parsedQuery?: ParsedQuery;
  metadata?: Record<string, any>;
}

export interface ConversationContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  messages: ConversationMessage[];
  userPreferences: UserPreferences;
  inferredContext: InferredContext;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

export interface UserPreferences {
  preferredAggregation?: string;
  preferredTimeframe?: string;
  focusEntities?: string[];
  responseFormat?: 'narrative' | 'structured' | 'brief';
  includeSourceCitations?: boolean;
  language?: string;
}

export interface InferredContext {
  currentTopic?: string;
  previousEntities: string[];
  previousConstraints: Record<string, any>;
  focusArea?: string;
  userRole?: string;
  department?: string;
}

export interface ContextualQuery {
  original: ParsedQuery;
  enriched: ParsedQuery;
  implicitReferences: string[];
  assumedContext: Record<string, any>;
}

export class ConversationContextManager {
  private contexts: Map<string, ConversationContext> = new Map();
  private readonly SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

  /**
   * Create or retrieve conversation session
   */
  getOrCreateContext(
    sessionId: string,
    userId: string,
    organizationId: string,
  ): ConversationContext {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        sessionId,
        userId,
        organizationId,
        messages: [],
        userPreferences: {},
        inferredContext: {
          previousEntities: [],
          previousConstraints: {},
        },
        createdAt: new Date(),
        lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + this.SESSION_DURATION),
      });
    } else {
      const context = this.contexts.get(sessionId)!;
      context.lastActivityAt = new Date();
      context.expiresAt = new Date(Date.now() + this.SESSION_DURATION);
    }

    return this.contexts.get(sessionId)!;
  }

  /**
   * Add message to conversation history
   */
  addMessage(
    context: ConversationContext,
    role: 'user' | 'assistant',
    content: string,
    parsedQuery?: ParsedQuery,
  ): ConversationMessage {
    const message: ConversationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
      parsedQuery,
    };

    context.messages.push(message);

    // Limit history to last 20 messages
    if (context.messages.length > 20) {
      context.messages = context.messages.slice(-20);
    }

    // Update inferred context for user messages
    if (role === 'user' && parsedQuery) {
      this.updateInferredContext(context, parsedQuery);
    }

    return message;
  }

  /**
   * Enrich query with conversational context
   */
  enrichQueryWithContext(context: ConversationContext, currentQuery: ParsedQuery): ContextualQuery {
    const enriched = JSON.parse(JSON.stringify(currentQuery)); // Deep copy

    const implicitReferences: string[] = [];
    const assumedContext: Record<string, any> = {};

    // Fill in missing entities from previous context
    if (currentQuery.entities.length === 0 && context.inferredContext.previousEntities.length > 0) {
      enriched.entities = context.inferredContext.previousEntities.map(e => ({
        value: e,
        type: 'custom',
        confidence: 0.6,
        sourceIndex: 0,
      }));
      implicitReferences.push('Referring to previously mentioned entities');
      assumedContext.appliedPreviousEntities = true;
    }

    // Fill in constraints from context
    if (currentQuery.constraints.length === 0 && Object.keys(context.inferredContext.previousConstraints).length > 0) {
      for (const [field, value] of Object.entries(context.inferredContext.previousConstraints)) {
        enriched.constraints.push({
          field,
          operator: 'equals',
          value,
          confidence: 0.5,
        });
        implicitReferences.push(`Applied previous filter: ${field}`);
      }
      assumedContext.appliedPreviousConstraints = true;
    }

    // Apply user preferences
    if (!enriched.aggregation && context.userPreferences.preferredAggregation) {
      enriched.aggregation = context.userPreferences.preferredAggregation;
      implicitReferences.push('Using preferred aggregation method');
      assumedContext.appliedUserPreference = true;
    }

    if (!enriched.timeframe && context.userPreferences.preferredTimeframe) {
      enriched.timeframe = { relative: context.userPreferences.preferredTimeframe };
      implicitReferences.push('Using preferred timeframe');
    }

    return {
      original: currentQuery,
      enriched,
      implicitReferences,
      assumedContext,
    };
  }

  /**
   * Update user preferences based on interaction
   */
  updateUserPreferences(context: ConversationContext, query: ParsedQuery, wasHelpful: boolean): void {
    if (query.aggregation && wasHelpful) {
      context.userPreferences.preferredAggregation = query.aggregation;
    }

    if (query.timeframe && wasHelpful) {
      context.userPreferences.preferredTimeframe = query.timeframe.relative;
    }

    if (query.entities.length > 0 && wasHelpful) {
      const entityValues = query.entities.map(e => e.value);
      context.userPreferences.focusEntities = entityValues;
    }
  }

  /**
   * Get conversation summary for context briefing
   */
  getContextSummary(context: ConversationContext): string {
    if (context.messages.length === 0) {
      return 'No conversation history.';
    }

    const userMessages = context.messages.filter(m => m.role === 'user');
    const topics = new Set<string>();

    for (const msg of userMessages) {
      if (msg.parsedQuery) {
        topics.add(msg.parsedQuery.intent.type);
      }
    }

    const topicsList = Array.from(topics).join(', ');
    const messageCount = context.messages.length;

    return `Conversation with ${messageCount} messages covering: ${topicsList}. Focus entities: ${context.inferredContext.previousEntities.join(', ') || 'none identified'}.`;
  }

  /**
   * Extract related conversation snippets for reference
   */
  getRelatedSnippets(context: ConversationContext, query: ParsedQuery, limit: number = 3): ConversationMessage[] {
    const relevant: Array<{
      message: ConversationMessage;
      score: number;
    }> = [];

    for (const message of context.messages) {
      if (!message.parsedQuery) continue;

      let score = 0;

      // Match on intent
      if (message.parsedQuery.intent.type === query.intent.type) {
        score += 2;
      }

      // Match on entities
      const sharedEntities = query.entities.filter(e =>
        message.parsedQuery!.entities.some(me => me.value === e.value),
      );
      score += sharedEntities.length * 1.5;

      // Match on timeframe
      if (
        message.parsedQuery.timeframe?.relative === query.timeframe?.relative
      ) {
        score += 1;
      }

      if (score > 0) {
        relevant.push({ message, score });
      }
    }

    return relevant
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.message);
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [sessionId, context] of this.contexts.entries()) {
      if (context.expiresAt < now) {
        this.contexts.delete(sessionId);
      }
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.messages = [];
      context.inferredContext = {
        previousEntities: [],
        previousConstraints: {},
      };
    }
  }

  private updateInferredContext(context: ConversationContext, query: ParsedQuery): void {
    // Update previous entities
    if (query.entities.length > 0) {
      context.inferredContext.previousEntities = query.entities.map(e => e.value);
    }

    // Update previous constraints
    if (query.constraints.length > 0) {
      context.inferredContext.previousConstraints = query.constraints.reduce(
        (acc, c) => {
          acc[c.field] = c.value;
          return acc;
        },
        {} as Record<string, any>,
      );
    }

    // Infer focus area
    if (query.entities.length > 0) {
      context.inferredContext.focusArea = query.entities[0].type;
    }

    // Update current topic
    context.inferredContext.currentTopic = query.intent.type;
  }
}
