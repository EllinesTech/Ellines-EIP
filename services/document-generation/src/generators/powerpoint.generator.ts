/**
 * PowerPoint Presentation Generator
 * Requirement 27.4: Generate PowerPoint presentations with slides, animations, speaker notes
 */

import { Injectable, Logger } from '@nestjs/common';
import PptxGenJS from 'pptxgenjs';
import {
  PowerPointConfig,
  SlideDefinition,
  BrandingConfig,
} from '../interfaces/document-generation.interfaces';

const BRAND_PRIMARY = '6F2D8D';
const BRAND_DARK = '0F172A';
const BRAND_WHITE = 'FFFFFF';

@Injectable()
export class PowerPointGeneratorService {
  private readonly logger = new Logger(PowerPointGeneratorService.name);

  /**
   * Generate a PowerPoint presentation buffer
   * Requirement 27.4
   */
  async generate(config: PowerPointConfig): Promise<Buffer> {
    this.logger.log(`Generating PowerPoint: "${config.title || 'Untitled'}"`);

    const pptx = new PptxGenJS();

    pptx.author = config.author || config.branding?.organizationName || 'Ellines EIP';
    pptx.title = config.title || 'Presentation';
    pptx.subject = config.title || 'Ellines EIP Presentation';
    pptx.company = config.branding?.organizationName || 'Ellines Tech';

    const primaryColor = `#${config.branding?.primaryColor?.replace('#', '') || BRAND_PRIMARY}`;
    const masterBg = config.masterSlide?.backgroundColor || `#${BRAND_DARK}`;

    // Master slide / theme
    pptx.defineSlideMaster({
      title: 'ELLINES_MASTER',
      background: { color: masterBg.replace('#', '') },
      objects: [
        // Bottom branding bar
        {
          rect: {
            x: 0,
            y: 6.8,
            w: '100%',
            h: 0.4,
            fill: { color: primaryColor.replace('#', '') },
          },
        },
        // Org name in footer
        {
          text: {
            text: config.branding?.organizationName || 'Ellines EIP',
            options: {
              x: 0.1,
              y: 6.82,
              w: 4,
              h: 0.35,
              color: BRAND_WHITE,
              fontSize: 9,
              fontFace: config.branding?.fontFamily || 'Calibri',
            },
          },
        },
      ],
    });

    // Add title slide first if title provided
    if (config.title && (!config.slides[0] || config.slides[0].layout !== 'title')) {
      const titleSlide = pptx.addSlide({ masterName: 'ELLINES_MASTER' });
      this.buildTitleSlide(titleSlide, config);
    }

    // Build each slide
    for (let i = 0; i < config.slides.length; i++) {
      const slideDef = config.slides[i];
      const slide = pptx.addSlide({ masterName: 'ELLINES_MASTER' });

      this.buildSlide(slide, slideDef, config.branding);

      // Speaker notes
      const noteCfg = config.speakerNotes?.find((n) => n.slideIndex === i);
      if (noteCfg?.notes) {
        slide.addNotes(noteCfg.notes);
      }
    }

    const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    this.logger.log(`PowerPoint generated (${buffer.length} bytes)`);
    return buffer;
  }

  private buildTitleSlide(slide: PptxGenJS.Slide, config: PowerPointConfig): void {
    const primaryColor = config.branding?.primaryColor?.replace('#', '') || BRAND_PRIMARY;
    const fontFace = config.branding?.fontFamily || 'Calibri';

    // Large title
    slide.addText(config.title || 'Presentation', {
      x: 0.5,
      y: 1.5,
      w: 9,
      h: 2,
      align: 'center',
      fontSize: 40,
      bold: true,
      color: BRAND_WHITE,
      fontFace,
    });

    if (config.branding?.tagline) {
      slide.addText(config.branding.tagline, {
        x: 0.5,
        y: 3.8,
        w: 9,
        h: 0.8,
        align: 'center',
        fontSize: 16,
        color: `#${primaryColor}`,
        fontFace,
      });
    }

    slide.addText(new Date().toLocaleDateString(), {
      x: 0.5,
      y: 5.5,
      w: 9,
      h: 0.5,
      align: 'center',
      fontSize: 11,
      color: 'AAAAAA',
      fontFace,
    });
  }

  private buildSlide(
    slide: PptxGenJS.Slide,
    def: SlideDefinition,
    branding?: BrandingConfig,
  ): void {
    const primaryColor = branding?.primaryColor?.replace('#', '') || BRAND_PRIMARY;
    const fontFace = branding?.fontFamily || 'Calibri';

    // Slide title
    if (def.title) {
      slide.addText(def.title, {
        x: 0.3,
        y: 0.2,
        w: 9.1,
        h: 0.8,
        fontSize: 24,
        bold: true,
        color: BRAND_WHITE,
        fontFace,
        underline: { style: 'none', color: `#${primaryColor}` },
      });
      // Underline accent
      slide.addShape(pptxgenjs_shape('rect'), {
        x: 0.3,
        y: 0.95,
        w: 9.1,
        h: 0.04,
        fill: { color: primaryColor },
      });
    }

    // Subtitle
    if (def.subtitle) {
      slide.addText(def.subtitle, {
        x: 0.3,
        y: 1.05,
        w: 9.1,
        h: 0.5,
        fontSize: 14,
        italic: true,
        color: 'CCCCCC',
        fontFace,
      });
    }

    const contentY = def.subtitle ? 1.7 : 1.3;

    // Content bullets
    if (def.content?.length) {
      const bulletText = def.content.map((line) => ({
        text: line,
        options: { bullet: true, fontSize: 16, color: BRAND_WHITE, fontFace },
      }));
      slide.addText(bulletText, {
        x: 0.5,
        y: contentY,
        w: def.imageData ? 5 : 8.7,
        h: 4.5,
        valign: 'top',
      });
    }

    // Image on right side
    if (def.imageData) {
      try {
        slide.addImage({
          data: `image/png;base64,${def.imageData}`,
          x: 5.7,
          y: contentY,
          w: 3.5,
          h: 3,
        });
      } catch {
        this.logger.warn('Could not embed image in slide');
      }
    }

    // Chart
    if (def.chartData) {
      const chartData = [
        {
          name: def.chartData.title,
          labels: def.chartData.labels,
          values: def.chartData.values,
        },
      ];
      const chartType =
        def.chartData.type === 'bar'
          ? 'bar'
          : def.chartData.type === 'line'
          ? 'line'
          : 'pie';

      slide.addChart(chartType as any, chartData, {
        x: 0.5,
        y: contentY,
        w: 8.7,
        h: 4.2,
        showTitle: true,
        title: def.chartData.title,
        chartColors: [primaryColor, '2563EB', '10B981', 'F59E0B', 'EF4444'],
      });
    }
  }
}

/** Helper to avoid importing internal pptxgenjs shape constants */
function pptxgenjs_shape(name: string): any {
  return name;
}
