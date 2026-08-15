/**
 * Branding Applier
 * Requirement 27.6: Apply organisation logos, colours, fonts across documents
 */

import { Injectable, Logger } from '@nestjs/common';
import { BrandingConfig, BrandingContext } from '../interfaces/document-generation.interfaces';

// Ellines EIP default branding
const DEFAULT_BRANDING: BrandingConfig = {
  organizationName: 'Ellines EIP',
  primaryColor: '#6F2D8D',
  secondaryColor: '#2563EB',
  fontFamily: 'Calibri',
  website: 'https://eip.ellines.co.ke',
  tagline: 'Where Enterprise Systems Think Together',
};

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);

  /**
   * Apply branding configuration and return a branding context for use in generators
   * Requirement 27.6
   */
  applyBranding(config: Partial<BrandingConfig>): BrandingContext {
    const merged = this.mergeBranding(config);
    const elements = this.listAppliedElements(merged);

    this.logger.log(`Branding applied for "${merged.organizationName}": ${elements.join(', ')}`);

    return {
      config: merged,
      appliedAt: new Date(),
      elements,
    };
  }

  /**
   * Merge incoming branding config with platform defaults
   */
  mergeBranding(incoming: Partial<BrandingConfig>): BrandingConfig {
    return {
      organizationName: incoming.organizationName || DEFAULT_BRANDING.organizationName,
      logoBase64: incoming.logoBase64 || DEFAULT_BRANDING.logoBase64,
      primaryColor: this.validateColor(incoming.primaryColor) || DEFAULT_BRANDING.primaryColor,
      secondaryColor:
        this.validateColor(incoming.secondaryColor) || DEFAULT_BRANDING.secondaryColor,
      fontFamily: incoming.fontFamily || DEFAULT_BRANDING.fontFamily,
      website: incoming.website || DEFAULT_BRANDING.website,
      tagline: incoming.tagline || DEFAULT_BRANDING.tagline,
    };
  }

  /**
   * Get the default Ellines EIP branding
   */
  getDefaultBranding(): BrandingConfig {
    return { ...DEFAULT_BRANDING };
  }

  /**
   * Validate a CSS hex colour string — returns null if invalid
   */
  validateColor(color?: string): string | null {
    if (!color) return null;
    const hex = color.startsWith('#') ? color : `#${color}`;
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex) ? hex : null;
  }

  private listAppliedElements(config: BrandingConfig): string[] {
    const elements: string[] = [];
    if (config.organizationName) elements.push('organization_name');
    if (config.logoBase64) elements.push('logo');
    if (config.primaryColor) elements.push('primary_color');
    if (config.secondaryColor) elements.push('secondary_color');
    if (config.fontFamily) elements.push('font_family');
    if (config.website) elements.push('website');
    if (config.tagline) elements.push('tagline');
    return elements;
  }
}
