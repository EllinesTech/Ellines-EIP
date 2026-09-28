/**
 * QueryClassifierService
 *
 * Classifies a free-text query string into one of five QueryTypes using keyword
 * heuristics and pattern matching, then maps that type to the set of
 * ModelCapability strings that should handle it.
 *
 * Classification is deterministic: the same input always produces the same
 * output (no randomness, no external calls).
 *
 * Requirement 1.2: Analyse query type and route to the most appropriate model.
 * Requirement 1.5: Fall back gracefully when a specialised model is unavailable.
 * Requirement 1.7: Use weighted voting / meta-learning to resolve disagreements.
 */

import { Injectable, Logger } from '@nestjs/common';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * The five specialised query domains supported by the multi-model orchestrator.
 * Each domain maps to one or more model capabilities in the registry.
 */
export type QueryType = 'language' | 'forecast' | 'anomaly' | 'vision' | 'reasoning';

/**
 * A string alias for capability names stored in `AiModelRegistry.capabilities[]`.
 * Examples: 'language_understanding', 'time_series_forecasting', 'anomaly_detection',
 *           'computer_vision', 'knowledge_reasoning'.
 */
export type ModelCapability = string;

/**
 * The result of classifying a query.
 */
export interface QueryClassification {
  queryType: QueryType;
  capabilities: ModelCapability[];
  /** Confidence in the classification, 0–1. Used by the router for fallback decisions. */
  confidence: number;
}

// ─── Internal heuristic tables ────────────────────────────────────────────────

/**
 * Pattern rule: a regex and the weight it contributes when it matches.
 * Weights are additive; the query type with the highest total weight wins.
 */
interface PatternRule {
  pattern: RegExp;
  weight: number;
}

/** Heuristic keyword/pattern table per query type (sorted by specificity). */
const HEURISTICS: Record<QueryType, PatternRule[]> = {
  forecast: [
    { pattern: /\bforecast\b/i,                           weight: 3 },
    { pattern: /\bpredict\b/i,                            weight: 3 },
    { pattern: /\bprojection\b/i,                         weight: 2 },
    { pattern: /\btrend\b/i,                              weight: 2 },
    { pattern: /\bnext\s+(week|month|quarter|year)\b/i,   weight: 2 },
    { pattern: /\bwill\s+\w+\s+(be|reach|hit)\b/i,        weight: 2 },
    { pattern: /\btime\s+series\b/i,                      weight: 3 },
    { pattern: /\bexpected\s+value\b/i,                   weight: 2 },
    { pattern: /\bhow\s+much\s+will\b/i,                  weight: 2 },
    { pattern: /\bestimate\b/i,                            weight: 1 },
  ],

  anomaly: [
    { pattern: /\banomaly\b/i,                            weight: 3 },
    { pattern: /\boutlier\b/i,                            weight: 3 },
    { pattern: /\bunusual\b/i,                            weight: 2 },
    { pattern: /\bspike\b/i,                              weight: 2 },
    { pattern: /\bdrop\b/i,                               weight: 1 },
    { pattern: /\bsurge\b/i,                              weight: 2 },
    { pattern: /\babnormal\b/i,                           weight: 3 },
    { pattern: /\bwhat('s|\s+is)\s+wrong\b/i,             weight: 2 },
    { pattern: /\bissue|error|fault|failure\b/i,          weight: 1 },
    { pattern: /\bsecurity\s+(alert|threat|breach)\b/i,   weight: 2 },
    { pattern: /\bdetect\b/i,                             weight: 1 },
  ],

  vision: [
    { pattern: /\bimage\b/i,                              weight: 3 },
    { pattern: /\bphoto\b/i,                              weight: 3 },
    { pattern: /\bscreenshot\b/i,                         weight: 3 },
    { pattern: /\bpicture\b/i,                            weight: 3 },
    { pattern: /\bvideo\b/i,                              weight: 2 },
    { pattern: /\bvisual\b/i,                             weight: 2 },
    { pattern: /\bscan\b/i,                               weight: 2 },
    { pattern: /\bocr\b/i,                                weight: 3 },
    { pattern: /\brecognize\b/i,                          weight: 2 },
    { pattern: /\bdiagram\b/i,                            weight: 2 },
    { pattern: /\bchart\s+image\b/i,                      weight: 2 },
  ],

  reasoning: [
    { pattern: /\bwhy\b/i,                                weight: 2 },
    { pattern: /\bcause\b/i,                              weight: 2 },
    { pattern: /\brelationship\b/i,                       weight: 2 },
    { pattern: /\bhow\s+does\b/i,                         weight: 2 },
    { pattern: /\bimpact\b/i,                             weight: 1 },
    { pattern: /\bknowledge\s+(graph|base)\b/i,           weight: 3 },
    { pattern: /\breason(ing)?\b/i,                       weight: 3 },
    { pattern: /\binfer\b/i,                              weight: 2 },
    { pattern: /\bcorrelat(e|ion)\b/i,                    weight: 2 },
    { pattern: /\broot\s+cause\b/i,                       weight: 3 },
    { pattern: /\bcausal\b/i,                             weight: 3 },
    { pattern: /\bmulti.?hop\b/i,                         weight: 3 },
    { pattern: /\bconnect(ion|ed)?\b/i,                   weight: 1 },
    { pattern: /\bwhat\s+if\b/i,                          weight: 2 },
  ],

  // 'language' is the catch-all; low weights so it only wins for truly NLP queries
  language: [
    { pattern: /\bsummar(y|ize)\b/i,                      weight: 2 },
    { pattern: /\btranslat(e|ion)\b/i,                    weight: 3 },
    { pattern: /\bsentiment\b/i,                          weight: 3 },
    { pattern: /\bclassify\s+text\b/i,                    weight: 3 },
    { pattern: /\bextract\s+entit(y|ies)\b/i,             weight: 2 },
    { pattern: /\bnamed\s+entit(y|ies)\b/i,               weight: 3 },
    { pattern: /\blanguage\b/i,                           weight: 1 },
    { pattern: /\bnlp\b/i,                                weight: 3 },
    { pattern: /\bparse\b/i,                              weight: 1 },
    { pattern: /\bwhat\s+does\b/i,                        weight: 1 },
    { pattern: /\bexplain\b/i,                            weight: 1 },
    { pattern: /\bdescribe\b/i,                           weight: 1 },
  ],
};

/** Maps each QueryType to the canonical capability strings used by the model registry. */
const CAPABILITY_MAP: Record<QueryType, ModelCapability[]> = {
  language:  ['language_understanding'],
  forecast:  ['time_series_forecasting'],
  anomaly:   ['anomaly_detection'],
  vision:    ['computer_vision'],
  reasoning: ['knowledge_reasoning'],
};

/** Minimum score a type must achieve to win (prevents noise classification). */
const MIN_WIN_SCORE = 1;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class QueryClassifierService {
  private readonly logger = new Logger(QueryClassifierService.name);

  /**
   * Classify `query` into a `QueryType` and return the matching
   * `ModelCapability[]` that the router should request from the registry.
   *
   * Classification is *deterministic*: identical input always yields the same
   * output. No randomness, no I/O.
   *
   * Requirement 1.2: route to the most appropriate AI model or combination.
   */
  classify(query: string): QueryClassification {
    if (!query || query.trim().length === 0) {
      this.logger.debug('Empty query — defaulting to language');
      return {
        queryType: 'language',
        capabilities: CAPABILITY_MAP['language'],
        confidence: 0.5,
      };
    }

    const scores = this.scoreQuery(query);
    const { winner, winnerScore, totalScore } = this.selectWinner(scores);

    const confidence =
      totalScore > 0 ? Math.min(1, winnerScore / totalScore) : 0.5;

    this.logger.debug(
      `Classified "${query.slice(0, 60)}" → ${winner} ` +
        `(score=${winnerScore}/${totalScore}, confidence=${confidence.toFixed(2)})`,
    );

    return {
      queryType: winner,
      capabilities: CAPABILITY_MAP[winner],
      confidence,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Apply every heuristic rule to `query` and accumulate a score per type.
   */
  private scoreQuery(query: string): Record<QueryType, number> {
    const scores: Record<QueryType, number> = {
      language:  0,
      forecast:  0,
      anomaly:   0,
      vision:    0,
      reasoning: 0,
    };

    for (const [type, rules] of Object.entries(HEURISTICS) as [QueryType, PatternRule[]][]) {
      for (const rule of rules) {
        if (rule.pattern.test(query)) {
          scores[type] += rule.weight;
        }
      }
    }

    return scores;
  }

  /**
   * Pick the QueryType with the highest score (ties broken by priority order:
   * reasoning > anomaly > forecast > vision > language).
   *
   * If no type exceeds `MIN_WIN_SCORE`, returns 'language' as the safe default.
   */
  private selectWinner(scores: Record<QueryType, number>): {
    winner: QueryType;
    winnerScore: number;
    totalScore: number;
  } {
    const TIEBREAK_ORDER: QueryType[] = ['reasoning', 'anomaly', 'forecast', 'vision', 'language'];

    let winner: QueryType = 'language';
    let winnerScore = scores['language'];

    for (const type of TIEBREAK_ORDER) {
      if (scores[type] > winnerScore) {
        winner = type;
        winnerScore = scores[type];
      }
    }

    // If nothing achieved meaningful signal, default to language
    if (winnerScore < MIN_WIN_SCORE) {
      winner = 'language';
      winnerScore = scores['language'];
    }

    const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);

    return { winner, winnerScore, totalScore };
  }
}
