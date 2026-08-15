/**
 * Export Formatter Tests
 * Test CSV, JSON, XML export functionality
 */

import { ExportFormatterService } from './export.formatter';

describe('ExportFormatterService', () => {
  let service: ExportFormatterService;

  beforeEach(() => {
    service = new ExportFormatterService();
  });

  describe('exportCSV', () => {
    it('should export simple data to CSV', () => {
      const data = [
        { name: 'Alice', age: 30, city: 'London' },
        { name: 'Bob', age: 25, city: 'Paris' },
      ];

      const csv = service.exportCSV(data);
      expect(csv).toContain('name,age,city');
      expect(csv).toContain('Alice,30,London');
      expect(csv).toContain('Bob,25,Paris');
    });

    it('should handle empty data', () => {
      const csv = service.exportCSV([]);
      expect(csv).toBe('');
    });

    it('should escape CSV special characters', () => {
      const data = [{ description: 'Contains, comma and "quotes"' }];
      const csv = service.exportCSV(data);
      expect(csv).toContain('"Contains, comma and ""quotes"""');
    });

    it('should handle custom headers', () => {
      const data = [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ];
      const csv = service.exportCSV(data, ['a', 'b']);
      expect(csv).toContain('a,b');
      expect(csv).toContain('1,2');
    });

    it('should handle null and undefined values', () => {
      const data = [{ name: 'Alice', age: null, city: undefined }];
      const csv = service.exportCSV(data);
      expect(csv).toContain('Alice,,');
    });

    it('should handle newlines in values', () => {
      const data = [{ note: 'Line1\nLine2' }];
      const csv = service.exportCSV(data);
      expect(csv).toContain('"Line1');
    });

    it('should export multiple rows with varied data types', () => {
      const data = [
        { id: 1, status: 'active', balance: 100.5 },
        { id: 2, status: 'inactive', balance: 200.75 },
        { id: 3, status: 'pending', balance: 0 },
      ];
      const csv = service.exportCSV(data);
      const lines = csv.split('\r\n');
      expect(lines.length).toBe(4); // header + 3 rows
      expect(lines[1]).toContain('1,active,100.5');
      expect(lines[3]).toContain('3,pending,0');
    });
  });

  describe('exportJSON', () => {
    it('should export data to formatted JSON', () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];

      const json = service.exportJSON(data);
      expect(json).toContain('"name"');
      expect(json).toContain('"Alice"');
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(data);
    });

    it('should handle complex nested objects', () => {
      const data = {
        users: [
          { id: 1, profile: { email: 'alice@example.com' } },
          { id: 2, profile: { email: 'bob@example.com' } },
        ],
      };

      const json = service.exportJSON(data);
      const parsed = JSON.parse(json);
      expect(parsed.users[0].profile.email).toBe('alice@example.com');
    });

    it('should handle arrays', () => {
      const data = [1, 2, 3, 4, 5];
      const json = service.exportJSON(data);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(data);
    });

    it('should handle null and undefined', () => {
      const data = { name: 'Alice', age: null, city: undefined };
      const json = service.exportJSON(data);
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('Alice');
      expect(parsed.age).toBeNull();
      expect(parsed.city).toBeUndefined();
    });

    it('should prettify JSON with 2-space indentation', () => {
      const data = { name: 'Alice' };
      const json = service.exportJSON(data);
      expect(json).toContain('  "name"');
    });
  });

  describe('exportXML', () => {
    it('should export data to XML with default root element', () => {
      const data = [
        { name: 'Alice', age: '30' },
        { name: 'Bob', age: '25' },
      ];

      const xml = service.exportXML(data);
      expect(xml).toContain('<?xml');
      expect(xml).toContain('<records>');
      expect(xml).toContain('<record>');
      expect(xml).toContain('<name>Alice</name>');
      expect(xml).toContain('<age>30</age>');
    });

    it('should allow custom root element name', () => {
      const data = [{ id: 1, title: 'Item 1' }];
      const xml = service.exportXML(data, 'items');
      expect(xml).toContain('<items>');
      expect(xml).toContain('</items>');
    });

    it('should handle null values with nil attribute', () => {
      const data = [{ name: 'Alice', age: null }];
      const xml = service.exportXML(data);
      expect(xml).toContain('nil="true"');
    });

    it('should sanitise XML element names', () => {
      const data = [{ 'user-name': 'Alice', '1st_value': 'test' }];
      const xml = service.exportXML(data);
      expect(xml).toContain('<user_name>');
      expect(xml).toContain('<_1st_value>');
    });

    it('should handle complex data types by converting to JSON', () => {
      const data = [{ id: 1, tags: ['a', 'b', 'c'] }];
      const xml = service.exportXML(data);
      expect(xml).toContain('<tags>');
      expect(xml).toContain('["a","b","c"]');
    });

    it('should include XML declaration and encoding', () => {
      const data = [{ name: 'Test' }];
      const xml = service.exportXML(data);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('should handle empty array', () => {
      const xml = service.exportXML([]);
      expect(xml).toContain('<records>');
      expect(xml).toContain('</records>');
    });

    it('should escape XML special characters', () => {
      const data = [{ content: 'Contains <tag> & special "chars"' }];
      const xml = service.exportXML(data);
      expect(xml).toContain('<content>');
      // xmlbuilder2 handles escaping
    });
  });
});
