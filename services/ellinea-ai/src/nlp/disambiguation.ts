/**
 * Query Disambiguation Engine
 * Generates clarifying questions for ambiguous queries and candidate interpretations
 */

import { ParsedQuery } from './query-parser';

export interface CandidateInterpretation {
  id: string;
  description: string;
  confidence: number;
  assumptions: string[];
  requiredClarifications: string[];
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: string[];
  relatedCandidates: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface DisambiguationResult {
  isAmbiguous: boolean;
  ambiguityScore: number; // 0-1, higher means more ambiguous
  candidates: CandidateInterpretation[];
  clarifyingQuestions: ClarifyingQuestion[];
  recommendedInterpretation?: CandidateInterpretation;
}

export class DisambiguationEngine {
  /**
   * Analyze query for ambiguity and generate disambiguation context
   */
  disambiguate(parsedQuery: ParsedQuery): DisambiguationResult {
    const ambiguityScore = this.calculateAmbiguityScore(parsedQuery);
    const isAmbiguous = ambiguityScore > 0.3;

    const candidates = this.generateCandidateInterpretations(parsedQuery);
    const clarifyingQuestions = this.generateClarifyingQuestions(parsedQuery, candidates);
    const recommendedInterpretation = candidates[0];

    return {
      isAmbiguous,
      ambiguityScore,
      candidates,
      clarifyingQuestions,
      recommendedInterpretation,
    };
  }

  private calculateAmbiguityScore(query: ParsedQuery): number {
    let score = 0;

    // Low parse confidence indicates ambiguity
    if (query.parseConfidence < 0.6) {
      score += 0.3;
    }

    // Multiple entities of same type indicates ambiguity
    const entityTypes = query.entities.map(e => e.type);
    const typeCounts = new Map<string, number>();
    for (const type of entityTypes) {
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    for (const count of typeCounts.values()) {
      if (count > 1) {
        score += 0.2;
      }
    }

    // Few or no constraints
    if (query.constraints.length === 0) {
      score += 0.15;
    }

    // Vague intent type
    if (query.intent.confidence < 0.5) {
      score += 0.25;
    }

    // No clear timeframe
    if (!query.timeframe) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  private generateCandidateInterpretations(query: ParsedQuery): CandidateInterpretation[] {
    const candidates: CandidateInterpretation[] = [];

    // Primary interpretation (most confident)
    candidates.push({
      id: 'primary',
      description: this.describeInterpretation(query, {}),
      confidence: query.parseConfidence,
      assumptions: this.listAssumptions(query),
      requiredClarifications: [],
    });

    // Alternative interpretations based on entity ambiguity
    if (query.entities.length > 1) {
      // Try filtering to different entities
      for (let i = 0; i < Math.min(query.entities.length, 3); i++) {
        const entity = query.entities[i];
        candidates.push({
          id: `entity_${i}`,
          description: `Focus on ${entity.type}: "${entity.value}"`,
          confidence: query.parseConfidence * 0.7,
          assumptions: [
            `Primary focus is on ${entity.type} "${entity.value}"`,
            `Other entities are secondary context`,
          ],
          requiredClarifications: [`Is "${entity.value}" the main subject you're asking about?`],
        });
      }
    }

    // Alternative interpretations for different timeframes
    if (!query.timeframe) {
      const timeframes = ['today', 'this_week', 'this_month', 'this_year'];
      for (const tf of timeframes.slice(0, 2)) {
        candidates.push({
          id: `timeframe_${tf}`,
          description: `${this.describeInterpretation(query, {})} for ${tf}`,
          confidence: query.parseConfidence * 0.6,
          assumptions: [`Timeframe is limited to ${tf}`],
          requiredClarifications: [`Should this analysis be limited to ${tf}?`],
        });
      }
    }

    // Sort by confidence
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  private generateClarifyingQuestions(
    query: ParsedQuery,
    candidates: CandidateInterpretation[],
  ): ClarifyingQuestion[] {
    const questions: ClarifyingQuestion[] = [];
    const questionIds = new Map<string, ClarifyingQuestion>();

    // Question about primary subject if ambiguous entities
    if (query.entities.length > 1) {
      const entityOptions = query.entities
        .slice(0, 5)
        .map(e => `${e.type}: "${e.value}"`)
        .concat('All of the above');

      const q: ClarifyingQuestion = {
        id: 'subject',
        question: 'Which subject are you primarily interested in?',
        options: entityOptions,
        relatedCandidates: candidates
          .filter(c => c.id.startsWith('entity_'))
          .map(c => c.id),
        priority: 'high',
      };
      questions.push(q);
      questionIds.set('subject', q);
    }

    // Question about timeframe if not specified
    if (!query.timeframe) {
      const q: ClarifyingQuestion = {
        id: 'timeframe',
        question: 'What timeframe should this analysis cover?',
        options: ['Today', 'This week', 'This month', 'This year', 'All time'],
        relatedCandidates: candidates
          .filter(c => c.id.startsWith('timeframe_'))
          .map(c => c.id),
        priority: 'high',
      };
      questions.push(q);
      questionIds.set('timeframe', q);
    }

    // Question about aggregation if not specified
    if (!query.aggregation) {
      const q: ClarifyingQuestion = {
        id: 'aggregation',
        question: 'How should the results be aggregated?',
        options: ['Sum total', 'Average', 'Count', 'Maximum', 'Minimum'],
        relatedCandidates: [],
        priority: 'medium',
      };
      questions.push(q);
      questionIds.set('aggregation', q);
    }

    // Question about sorting if applicable
    if (!query.sorting && query.entities.length > 0) {
      const q: ClarifyingQuestion = {
        id: 'sorting',
        question: 'How should the results be sorted?',
        options: ['Alphabetically', 'By relevance', 'By date (newest first)', 'By date (oldest first)', 'By value (highest first)'],
        relatedCandidates: [],
        priority: 'low',
      };
      questions.push(q);
      questionIds.set('sorting', q);
    }

    return questions;
  }

  private describeInterpretation(query: ParsedQuery, options: Record<string, any>): string {
    const parts: string[] = [];

    parts.push(`${query.intent.action.charAt(0).toUpperCase()}${query.intent.action.slice(1)}`);

    if (query.entities.length > 0) {
      const entityDesc = query.entities
        .slice(0, 3)
        .map(e => `${e.type}(${e.value})`)
        .join(', ');
      parts.push(`for ${entityDesc}`);
    }

    if (query.constraints.length > 0) {
      const constraintDesc = query.constraints
        .slice(0, 2)
        .map(c => `${c.field} ${c.operator} ${c.value}`)
        .join(' and ');
      parts.push(`where ${constraintDesc}`);
    }

    if (query.timeframe) {
      parts.push(`for ${query.timeframe.relative || 'specified period'}`);
    }

    if (query.aggregation) {
      parts.push(`with ${query.aggregation} aggregation`);
    }

    return parts.join(' ');
  }

  private listAssumptions(query: ParsedQuery): string[] {
    const assumptions: string[] = [];

    assumptions.push(`Intent: ${query.intent.type} (${query.intent.action})`);

    if (query.entities.length === 0) {
      assumptions.push('No specific entities identified - may be a general question');
    } else if (query.entities.length === 1) {
      assumptions.push(`Single entity: ${query.entities[0].type} "${query.entities[0].value}"`);
    } else {
      assumptions.push(`Multiple entities: ${query.entities.map(e => e.type).join(', ')}`);
    }

    if (query.constraints.length > 0) {
      assumptions.push(`Constraints applied: ${query.constraints.length}`);
    } else {
      assumptions.push('No specific constraints - results may be broad');
    }

    if (query.timeframe) {
      assumptions.push(`Timeframe: ${query.timeframe.relative || 'custom range'}`);
    } else {
      assumptions.push('No timeframe specified - will use default or all data');
    }

    if (query.aggregation) {
      assumptions.push(`Aggregation method: ${query.aggregation}`);
    }

    return assumptions;
  }

  /**
   * Apply user clarification to refine query interpretation
   */
  applyClarification(
    result: DisambiguationResult,
    clarificationId: string,
    selectedOption: string,
  ): DisambiguationResult {
    // In a real implementation, this would update the ParsedQuery
    // and re-run the disambiguation with the refined query
    // For now, we'll just mark the ambiguity as resolved

    return {
      ...result,
      isAmbiguous: false,
      ambiguityScore: result.ambiguityScore * 0.5,
      clarifyingQuestions: result.clarifyingQuestions.filter(q => q.id !== clarificationId),
    };
  }
}
