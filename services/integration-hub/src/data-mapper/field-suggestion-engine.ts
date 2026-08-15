/**
 * FieldSuggestionEngine
 * Requirement 22.4: Intelligent data mapping — field suggestion engine
 *
 * Given a source schema and a target schema, scores every
 * (source field, target field) pair and returns ranked suggestions.
 *
 * Confidence is composed of:
 *  - 50% string similarity (Levenshtein on normalised names)
 *  - 30% semantic type compatibility
 *  - 20% contextual hint bonus (caller-supplied hints)
 */

import { Injectable, Logger } from '@nestjs/common';
import { FieldSchema, FieldType } from './schema-detector';

export interface MappingHint {
  /** Source field name */
  sourceField: string;
  /** Target field name */
  targetField: string;
  /** Bonus added to confidence (0-1) */
  bonus: number;
}

export interface FieldMappingSuggestion {
  sourceField: string;
  targetField: string;
  /** Combined confidence score, 0-1 */
  confidence: number;
  /** Breakdown of score components */
  breakdown: {
    nameSimilarity: number;
    typeCompatibility: number;
    contextBonus: number;
  };
}

export interface SuggestMappingsResult {
  suggestions: FieldMappingSuggestion[];
  /** Fields in source with no confident match (confidence < 0.3) */
  unmappedSource: string[];
  /** Fields in target with no confident match */
  unmappedTarget: string[];
}

@Injectable()
export class FieldSuggestionEngine {
  private readonly logger = new Logger(FieldSuggestionEngine.name);

  /**
   * Suggest field mappings from source schema → target schema.
   * Requirements 22.4 — field suggestion using similarity and context.
   */
  suggestMappings(
    sourceFields: FieldSchema[],
    targetFields: FieldSchema[],
    hints: MappingHint[] = [],
  ): SuggestMappingsResult {
    const suggestions: FieldMappingSuggestion[] = [];

    // Build a fast lookup for hints
    const hintMap = new Map<string, number>();
    for (const h of hints) {
      hintMap.set(`${h.sourceField}::${h.targetField}`, Math.min(1, Math.max(0, h.bonus)));
    }

    for (const src of sourceFields) {
      for (const tgt of targetFields) {
        const nameSimilarity = this.nameSimilarity(src.name, tgt.name);
        const typeCompatibility = this.typeCompatibility(src.type, tgt.type);
        const contextBonus = hintMap.get(`${src.name}::${tgt.name}`) ?? 0;

        const confidence = Math.min(
          1,
          nameSimilarity * 0.5 + typeCompatibility * 0.3 + contextBonus * 0.2,
        );

        suggestions.push({
          sourceField: src.name,
          targetField: tgt.name,
          confidence: Math.round(confidence * 1000) / 1000,
          breakdown: { nameSimilarity, typeCompatibility, contextBonus },
        });
      }
    }

    // Sort descending by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Determine unmapped fields (best match < 0.3 threshold)
    const mappedSrc = new Set<string>();
    const mappedTgt = new Set<string>();
    const CONFIDENCE_THRESHOLD = 0.3;

    for (const s of suggestions) {
      if (s.confidence >= CONFIDENCE_THRESHOLD) {
        mappedSrc.add(s.sourceField);
        mappedTgt.add(s.targetField);
      }
    }

    const unmappedSource = sourceFields.filter((f) => !mappedSrc.has(f.name)).map((f) => f.name);
    const unmappedTarget = targetFields.filter((f) => !mappedTgt.has(f.name)).map((f) => f.name);

    this.logger.debug(
      `Generated ${suggestions.length} mapping suggestions; unmapped src=${unmappedSource.length} tgt=${unmappedTarget.length}`,
    );

    return { suggestions, unmappedSource, unmappedTarget };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Normalised Levenshtein similarity in [0, 1].
   */
  nameSimilarity(a: string, b: string): number {
    const na = this.normalise(a);
    const nb = this.normalise(b);
    if (na === nb) return 1;
    if (na.length === 0 || nb.length === 0) return 0;
    const dist = this.levenshtein(na, nb);
    return 1 - dist / Math.max(na.length, nb.length);
  }

  /**
   * Type compatibility score in [0, 1].
   * Identical types = 1.0; compatible types = 0.7; incompatible = 0.0.
   */
  typeCompatibility(src: FieldType, tgt: FieldType): number {
    if (src === tgt) return 1.0;

    // Treat 'null'/'unknown' as partially compatible with any type
    if (src === 'null' || src === 'unknown' || tgt === 'null' || tgt === 'unknown') return 0.4;

    // Numeric-like compatibility
    const numeric: FieldType[] = ['number'];
    const textLike: FieldType[] = ['string', 'date'];
    const containerLike: FieldType[] = ['array', 'object'];

    if (numeric.includes(src) && numeric.includes(tgt)) return 0.9;
    if (textLike.includes(src) && textLike.includes(tgt)) return 0.7;
    if (containerLike.includes(src) && containerLike.includes(tgt)) return 0.6;

    return 0.0;
  }

  private normalise(name: string): string {
    // Remove common separators, lower-case, strip underscores/hyphens/camelCase
    return name
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }
}
