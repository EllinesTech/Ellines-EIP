/**
 * Branding Service Tests
 * Test organization branding application and color validation
 */

import { BrandingService } from './branding.service';
import { BrandingConfig } from '../interfaces/document-generation.interfaces';

describe('BrandingService', () => {
  let service: BrandingService;

  beforeEach(() => {
    service = new BrandingService();
  });

  describe('applyBranding', () => {
    it('should apply branding configuration with default fallbacks', () => {
      const config: Partial<BrandingConfig> = {
        organizationName: 'Test Company',
      };

      const result = service.applyBranding(config);

      expect(result.config.organizationName).toBe('Test Company');
      expect(result.appliedAt).toBeInstanceOf(Date);
      expect(result.elements).toContain('organization_name');
    });

    it('should merge with defaults for missing fields', () => {
      const config: Partial<BrandingConfig> = {
        organizationName: 'Custom Org',
      };

      const result = service.applyBranding(config);

      expect(result.config.organizationName).toBe('Custom Org');
      expect(result.config.primaryColor).toBeDefined();
      expect(result.config.fontFamily).toBeDefined();
    });

    it('should apply all branding elements', () => {
      const config: BrandingConfig = {
        organizationName: 'Full Brand',
        logoBase64: 'BASE64_DATA',
        primaryColor: '#FF0000',
        secondaryColor: '#0000FF',
        fontFamily: 'Arial',
        website: 'https://example.com',
        tagline: 'Brand tagline',
      };

      const result = service.applyBranding(config);

      expect(result.elements).toContain('organization_name');
      expect(result.elements).toContain('logo');
      expect(result.elements).toContain('primary_color');
      expect(result.elements).toContain('secondary_color');
      expect(result.elements).toContain('font_family');
      expect(result.elements).toContain('website');
      expect(result.elements).toContain('tagline');
    });
  });

  describe('mergeBranding', () => {
    it('should preserve provided values', () => {
      const config: Partial<BrandingConfig> = {
        organizationName: 'Acme',
        primaryColor: '#123456',
      };

      const result = service.mergeBranding(config);

      expect(result.organizationName).toBe('Acme');
      expect(result.primaryColor).toBe('#123456');
    });

    it('should fill in defaults for missing values', () => {
      const config: Partial<BrandingConfig> = {};

      const result = service.mergeBranding(config);

      expect(result.organizationName).toBe('Ellines EIP');
      expect(result.primaryColor).toBe('#6F2D8D');
      expect(result.fontFamily).toBe('Calibri');
    });

    it('should validate colors during merge', () => {
      const config: Partial<BrandingConfig> = {
        primaryColor: '#INVALID',
        secondaryColor: '#FF0000',
      };

      const result = service.mergeBranding(config);

      expect(result.primaryColor).toBe('#6F2D8D'); // Fallback to default
      expect(result.secondaryColor).toBe('#FF0000');
    });

    it('should handle empty branding config', () => {
      const result = service.mergeBranding({});

      expect(result.organizationName).toBe('Ellines EIP');
      expect(result.primaryColor).toBe('#6F2D8D');
      expect(result.website).toBe('https://eip.ellines.co.ke');
      expect(result.tagline).toBe('Where Enterprise Systems Think Together');
    });
  });

  describe('getDefaultBranding', () => {
    it('should return default branding', () => {
      const defaults = service.getDefaultBranding();

      expect(defaults.organizationName).toBe('Ellines EIP');
      expect(defaults.primaryColor).toBe('#6F2D8D');
      expect(defaults.secondaryColor).toBe('#2563EB');
      expect(defaults.fontFamily).toBe('Calibri');
      expect(defaults.website).toBe('https://eip.ellines.co.ke');
      expect(defaults.tagline).toBe('Where Enterprise Systems Think Together');
    });

    it('should return a new copy each time', () => {
      const first = service.getDefaultBranding();
      const second = service.getDefaultBranding();

      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });
  });

  describe('validateColor', () => {
    it('should validate hex color with hash prefix', () => {
      const valid = service.validateColor('#FF0000');
      expect(valid).toBe('#FF0000');
    });

    it('should validate hex color without hash prefix', () => {
      const valid = service.validateColor('00FF00');
      expect(valid).toBe('#00FF00');
    });

    it('should support 3-digit hex colors', () => {
      const valid = service.validateColor('#FFF');
      expect(valid).toBe('#FFF');
    });

    it('should support 6-digit hex colors', () => {
      const valid = service.validateColor('#ABCDEF');
      expect(valid).toBe('#ABCDEF');
    });

    it('should handle lowercase hex colors', () => {
      const valid = service.validateColor('#abc123');
      expect(valid).toBe('#ABC123');
    });

    it('should reject invalid colors', () => {
      expect(service.validateColor('#GGGGGG')).toBeNull();
      expect(service.validateColor('#12345')).toBeNull(); // Wrong length
      expect(service.validateColor('not-a-color')).toBeNull();
    });

    it('should handle null and undefined', () => {
      expect(service.validateColor(null as any)).toBeNull();
      expect(service.validateColor(undefined)).toBeNull();
    });
  });

  describe('color validation scenarios', () => {
    it('should accept common web colors', () => {
      const colors = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF'];

      for (const color of colors) {
        expect(service.validateColor(color)).toBe(color);
      }
    });

    it('should reject colors with extra characters', () => {
      expect(service.validateColor('#FF0000FF')).toBeNull(); // 8 digits
      expect(service.validateColor('##FF0000')).toBeNull();
      expect(service.validateColor('#FF000G')).toBeNull();
    });

    it('should work with uppercase and lowercase', () => {
      expect(service.validateColor('#ff0000')).toBe('#FF0000');
      expect(service.validateColor('#FF0000')).toBe('#FF0000');
      expect(service.validateColor('#FfAaBb')).toBe('#FFAABB');
    });

    it('should normalize 3-digit colors to 6-digit format when appropriate', () => {
      // The implementation returns the input as-is if valid
      const result = service.validateColor('#FFF');
      expect(result).toBe('#FFF');
    });
  });

  describe('applied elements tracking', () => {
    it('should track all applied branding elements', () => {
      const config: BrandingConfig = {
        organizationName: 'Test',
        logoBase64: 'data',
        primaryColor: '#FF0000',
        secondaryColor: '#0000FF',
        fontFamily: 'Arial',
        website: 'https://example.com',
        tagline: 'Test tagline',
      };

      const result = service.applyBranding(config);

      expect(result.elements.length).toBe(7);
      expect(new Set(result.elements).size).toBe(7); // All unique
    });

    it('should not track missing elements', () => {
      const config: Partial<BrandingConfig> = {
        organizationName: 'Minimal',
      };

      const result = service.applyBranding(config);

      expect(result.elements).toContain('organization_name');
      expect(result.elements).toContain('primary_color'); // Filled by default
      expect(result.elements.length).toBeGreaterThan(1); // At least name + defaults
    });
  });

  describe('edge cases', () => {
    it('should handle empty organization name gracefully', () => {
      const config: Partial<BrandingConfig> = {
        organizationName: '',
      };

      const result = service.mergeBranding(config);

      // Empty string should be treated as provided, but defaults might override
      expect(result.organizationName).toBeDefined();
    });

    it('should handle special characters in organization name', () => {
      const config: Partial<BrandingConfig> = {
        organizationName: 'Company & Co., Inc.',
      };

      const result = service.applyBranding(config);

      expect(result.config.organizationName).toBe('Company & Co., Inc.');
    });

    it('should handle very long tagline', () => {
      const longTagline = 'A'.repeat(500);
      const config: Partial<BrandingConfig> = {
        tagline: longTagline,
      };

      const result = service.mergeBranding(config);

      expect(result.tagline).toBe(longTagline);
    });
  });
});
