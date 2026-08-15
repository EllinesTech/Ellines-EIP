/**
 * FieldSuggestionEngine Unit Tests
 * Requirement 22.4: Field suggestion engine using similarity and context
 */

import { FieldSuggestionEngine } from './field-suggestion-engine';
import { FieldSchema } from './schema-detector';

describe('FieldSuggestionEngine', () => {
  let engine: FieldSuggestionEngine;

  beforeEach(() => {
    engine = new FieldSuggestionEngine();
  });

  describe('suggestMappings', () => {
    it('should suggest exact name matches with high confidence', () => {
      const source: FieldSchema[] = [
        {
          name: 'firstName',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'firstName',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      expect(result.suggestions.length).toBeGreaterThan(0);
      const topSuggestion = result.suggestions[0];
      expect(topSuggestion.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should suggest similar field names', () => {
      const source: FieldSchema[] = [
        {
          name: 'user_name',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'username',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      const suggestion = result.suggestions.find(
        (s) => s.sourceField === 'user_name' && s.targetField === 'username',
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.confidence).toBeGreaterThan(0.5);
    });

    it('should apply context hints to boost confidence', () => {
      const source: FieldSchema[] = [
        {
          name: 'firstName',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'first_name',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target, [
        { sourceField: 'firstName', targetField: 'first_name', bonus: 0.5 },
      ]);

      const suggestion = result.suggestions.find(
        (s) => s.sourceField === 'firstName' && s.targetField === 'first_name',
      );
      expect(suggestion!.confidence).toBeGreaterThan(0.7);
    });

    it('should consider type compatibility', () => {
      const source: FieldSchema[] = [
        {
          name: 'id',
          type: 'number',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'identifier',
          type: 'number',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      const suggestion = result.suggestions[0];
      expect(suggestion.breakdown.typeCompatibility).toBeGreaterThan(0);
    });

    it('should identify unmapped fields below confidence threshold', () => {
      const source: FieldSchema[] = [
        {
          name: 'xxxaaa',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'yyybbb',
          type: 'number',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      // xxxaaa vs yyybbb will have very low confidence: low name similarity + 0 type compatibility + 0 hint
      expect(result.suggestions[0].confidence).toBeLessThan(0.3);
      expect(result.unmappedSource).toContain('xxxaaa');
      expect(result.unmappedTarget).toContain('yyybbb');
    });

    it('should sort suggestions by confidence descending', () => {
      const source: FieldSchema[] = [
        {
          name: 'field1',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'field1',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
        {
          name: 'fieldX',
          type: 'number',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      for (let i = 1; i < result.suggestions.length; i++) {
        expect(result.suggestions[i - 1].confidence).toBeGreaterThanOrEqual(
          result.suggestions[i].confidence,
        );
      }
    });

    it('should handle normalized field names (camelCase vs snake_case)', () => {
      const source: FieldSchema[] = [
        {
          name: 'firstName',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'first_name',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      const suggestion = result.suggestions[0];
      expect(suggestion.breakdown.nameSimilarity).toBeGreaterThan(0.5);
    });

    it('should return confidence scores between 0 and 1', () => {
      const source: FieldSchema[] = [
        {
          name: 'field1',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'field2',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      for (const suggestion of result.suggestions) {
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
        expect(suggestion.breakdown.nameSimilarity).toBeGreaterThanOrEqual(0);
        expect(suggestion.breakdown.nameSimilarity).toBeLessThanOrEqual(1);
        expect(suggestion.breakdown.typeCompatibility).toBeGreaterThanOrEqual(0);
        expect(suggestion.breakdown.typeCompatibility).toBeLessThanOrEqual(1);
      }
    });
  });
});
