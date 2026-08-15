/**
 * SchemaDetector Unit Tests
 * Requirement 22.4: Automatic schema detection from data sources
 */

import { SchemaDetector } from './schema-detector';

describe('SchemaDetector', () => {
  let detector: SchemaDetector;

  beforeEach(() => {
    detector = new SchemaDetector();
  });

  describe('detectSchema', () => {
    it('should detect schema from empty records array', () => {
      const result = detector.detectSchema([]);
      expect(result.recordCount).toBe(0);
      expect(result.fields).toEqual([]);
      expect(result.detectedAt).toBeDefined();
    });

    it('should detect basic field types', () => {
      const records = [
        { name: 'John', age: 30, active: true, createdAt: '2024-01-01T12:00:00Z' },
        { name: 'Jane', age: 25, active: false, createdAt: '2024-01-02T12:00:00Z' },
      ];

      const result = detector.detectSchema(records);
      expect(result.recordCount).toBe(2);
      expect(result.fields.length).toBe(4);

      const nameField = result.fields.find((f) => f.name === 'name');
      expect(nameField?.type).toBe('string');
      expect(nameField?.nullable).toBe(false);
      expect(nameField?.occurrences).toBe(2);

      const ageField = result.fields.find((f) => f.name === 'age');
      expect(ageField?.type).toBe('number');

      const activeField = result.fields.find((f) => f.name === 'active');
      expect(activeField?.type).toBe('boolean');

      const createdAtField = result.fields.find((f) => f.name === 'createdAt');
      expect(createdAtField?.type).toBe('date');
    });

    it('should detect nullable fields', () => {
      const records = [
        { id: 1, optionalField: 'value' },
        { id: 2, optionalField: null },
        { id: 3 }, // missing field
      ];

      const result = detector.detectSchema(records);
      const optionalField = result.fields.find((f) => f.name === 'optionalField');
      expect(optionalField?.nullable).toBe(true);
      expect(optionalField?.occurrences).toBe(2);
    });

    it('should collect example values', () => {
      const records = [
        { status: 'active' },
        { status: 'inactive' },
        { status: 'pending' },
      ];

      const result = detector.detectSchema(records);
      const statusField = result.fields.find((f) => f.name === 'status');
      expect(statusField?.examples).toContain('active');
      expect(statusField?.examples).toContain('inactive');
      expect(statusField?.examples).toContain('pending');
    });

    it('should handle array and object types', () => {
      const records = [
        { id: 1, tags: ['a', 'b'], metadata: { key: 'value' } },
        { id: 2, tags: ['c'], metadata: { key2: 'value2' } },
      ];

      const result = detector.detectSchema(records);
      const tagsField = result.fields.find((f) => f.name === 'tags');
      expect(tagsField?.type).toBe('array');

      const metadataField = result.fields.find((f) => f.name === 'metadata');
      expect(metadataField?.type).toBe('object');
    });

    it('should limit examples to 5 per field', () => {
      const records = Array.from({ length: 10 }, (_, i) => ({
        value: `value-${i}`,
      }));

      const result = detector.detectSchema(records);
      const field = result.fields.find((f) => f.name === 'value');
      expect(field?.examples.length).toBeLessThanOrEqual(5);
    });

    it('should calculate field occurrences correctly', () => {
      const records = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3 }, // missing name
      ];

      const result = detector.detectSchema(records);
      const nameField = result.fields.find((f) => f.name === 'name');
      expect(nameField?.occurrences).toBe(2);
      expect(nameField?.totalRecords).toBe(3);
    });
  });
});
