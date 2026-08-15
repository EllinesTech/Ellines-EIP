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

    it('should handle empty source and target arrays', () => {
      const result = engine.suggestMappings([], []);
      expect(result.suggestions).toEqual([]);
      expect(result.unmappedSource).toEqual([]);
      expect(result.unmappedTarget).toEqual([]);
    });

    it('should handle single source multiple targets', () => {
      const source: FieldSchema[] = [
        {
          name: 'email',
          type: 'string',
          nullable: false,
          examples: ['test@example.com'],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'email',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
        {
          name: 'primary_email',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
        {
          name: 'secondary_email',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      expect(result.suggestions.length).toBe(3);
      const exactMatch = result.suggestions.find((s) => s.targetField === 'email');
      expect(exactMatch).toBeDefined();
      expect(exactMatch!.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should handle complex field naming patterns', () => {
      const source: FieldSchema[] = [
        {
          name: 'user_first_name_en',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'userFirstNameEnglish',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      const suggestion = result.suggestions[0];
      expect(suggestion.confidence).toBeGreaterThan(0.4);
    });

    it('should provide score breakdown detail', () => {
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
          name: 'id',
          type: 'number',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      const result = engine.suggestMappings(source, target);
      const suggestion = result.suggestions[0];
      
      expect(suggestion.breakdown).toBeDefined();
      expect(suggestion.breakdown.nameSimilarity).toBe(1.0);
      expect(suggestion.breakdown.typeCompatibility).toBe(1.0);
      expect(suggestion.breakdown.contextBonus).toBe(0);
    });

    it('should respect maximum hint bonus', () => {
      const source: FieldSchema[] = [
        {
          name: 'field_a',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'field_b',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      // Test with hint bonus > 1.0
      const result = engine.suggestMappings(source, target, [
        { sourceField: 'field_a', targetField: 'field_b', bonus: 2.0 }, // Will be clamped
      ]);

      const suggestion = result.suggestions[0];
      expect(suggestion.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle negative hint bonuses gracefully', () => {
      const source: FieldSchema[] = [
        {
          name: 'field_a',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];
      const target: FieldSchema[] = [
        {
          name: 'field_a',
          type: 'string',
          nullable: false,
          examples: [],
          occurrences: 1,
          totalRecords: 1,
        },
      ];

      // Test with negative hint bonus (should not happen in normal use)
      const result = engine.suggestMappings(source, target, [
        { sourceField: 'field_a', targetField: 'field_a', bonus: -0.5 }, // Will be clamped to 0
      ]);

      const suggestion = result.suggestions[0];
      expect(suggestion.confidence).toBeGreaterThan(0.7); // Still confident due to name/type match
    });
  });

  describe('nameSimilarity', () => {
    it('should return 1.0 for identical names', () => {
      expect(engine.nameSimilarity('firstName', 'firstName')).toBe(1.0);
      expect(engine.nameSimilarity('email', 'email')).toBe(1.0);
    });

    it('should be case-insensitive', () => {
      expect(engine.nameSimilarity('FirstName', 'firstName')).toBe(1.0);
      expect(engine.nameSimilarity('EMAIL', 'email')).toBe(1.0);
    });

    it('should handle camelCase vs snake_case', () => {
      const similarity = engine.nameSimilarity('firstName', 'first_name');
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should handle empty strings', () => {
      expect(engine.nameSimilarity('', '')).toBe(1.0);
      expect(engine.nameSimilarity('', 'field')).toBe(0);
      expect(engine.nameSimilarity('field', '')).toBe(0);
    });

    it('should return 0 for completely different names', () => {
      expect(engine.nameSimilarity('alpha', 'zulu')).toBeLessThan(0.5);
      expect(engine.nameSimilarity('customer', 'product')).toBeLessThan(0.5);
    });

    it('should handle partial matches', () => {
      const similarity = engine.nameSimilarity('firstName', 'name');
      expect(similarity).toBeGreaterThan(0.3);
      expect(similarity).toBeLessThan(1.0);
    });
  });

  describe('typeCompatibility', () => {
    it('should return 1.0 for identical types', () => {
      expect(engine.typeCompatibility('string', 'string')).toBe(1.0);
      expect(engine.typeCompatibility('number', 'number')).toBe(1.0);
      expect(engine.typeCompatibility('boolean', 'boolean')).toBe(1.0);
      expect(engine.typeCompatibility('date', 'date')).toBe(1.0);
      expect(engine.typeCompatibility('array', 'array')).toBe(1.0);
      expect(engine.typeCompatibility('object', 'object')).toBe(1.0);
    });

    it('should handle text-like type combinations', () => {
      const stringDate = engine.typeCompatibility('string', 'date');
      const dateString = engine.typeCompatibility('date', 'string');
      expect(stringDate).toBeGreaterThan(0.5);
      expect(dateString).toBeGreaterThan(0.5);
    });

    it('should handle container type combinations', () => {
      const arrayObject = engine.typeCompatibility('array', 'object');
      expect(arrayObject).toBeGreaterThan(0.5);
      expect(arrayObject).toBeLessThan(1.0);
    });

    it('should partially accept null and unknown', () => {
      const nullString = engine.typeCompatibility('null', 'string');
      const unknownNumber = engine.typeCompatibility('unknown', 'number');
      const stringNull = engine.typeCompatibility('string', 'null');
      
      expect(nullString).toBeGreaterThan(0.3);
      expect(nullString).toBeLessThan(1.0);
      expect(unknownNumber).toBeGreaterThan(0.3);
      expect(unknownNumber).toBeLessThan(1.0);
      expect(stringNull).toBe(nullString); // Symmetric
    });

    it('should return 0 for incompatible types', () => {
      const numberArray = engine.typeCompatibility('number', 'array');
      const booleanObject = engine.typeCompatibility('boolean', 'object');
      
      expect(numberArray).toBe(0);
      expect(booleanObject).toBe(0);
    });

    it('should handle all type combinations', () => {
      const types: Array<'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' | 'unknown'> = [
        'string', 'number', 'boolean', 'date', 'array', 'object', 'null', 'unknown'
      ];

      for (const src of types) {
        for (const tgt of types) {
          const compat = engine.typeCompatibility(src, tgt);
          expect(compat).toBeGreaterThanOrEqual(0);
          expect(compat).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
