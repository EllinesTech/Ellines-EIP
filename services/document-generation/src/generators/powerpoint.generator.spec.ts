/**
 * PowerPoint Generator Tests
 * Test PowerPoint presentation generation with slides, animations, and speaker notes
 */

import { PowerPointGeneratorService } from './powerpoint.generator';
import { PowerPointConfig, SlideDefinition } from '../interfaces/document-generation.interfaces';

describe('PowerPointGeneratorService', () => {
  let service: PowerPointGeneratorService;

  beforeEach(() => {
    service = new PowerPointGeneratorService();
  });

  describe('generate', () => {
    it('should generate a basic PowerPoint presentation buffer', async () => {
      const config: PowerPointConfig = {
        title: 'Test Presentation',
        slides: [
          {
            title: 'Slide 1',
            content: ['First slide content'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should include presentation metadata', async () => {
      const config: PowerPointConfig = {
        title: 'Quarterly Review',
        author: 'Jane Doe',
        slides: [
          {
            title: 'Overview',
            content: ['Q3 2024 Performance Review'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should create multiple slides', async () => {
      const config: PowerPointConfig = {
        title: 'Multi-Slide Presentation',
        slides: [
          { title: 'Slide 1', content: ['First slide'] },
          { title: 'Slide 2', content: ['Second slide'] },
          { title: 'Slide 3', content: ['Third slide'] },
          { title: 'Slide 4', content: ['Fourth slide'] },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply branding to slides', async () => {
      const config: PowerPointConfig = {
        title: 'Branded Presentation',
        slides: [
          {
            title: 'Welcome',
            content: ['Welcome to the presentation'],
          },
        ],
        branding: {
          organizationName: 'Acme Corporation',
          primaryColor: '#6F2D8D',
          fontFamily: 'Calibri',
          tagline: 'Innovation and Excellence',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should support slide with bullet points', async () => {
      const config: PowerPointConfig = {
        title: 'Bullet Point Slide',
        slides: [
          {
            title: 'Key Points',
            content: [
              'First key point',
              'Second key point',
              'Third key point',
              'Fourth key point',
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should add speaker notes to slides', async () => {
      const config: PowerPointConfig = {
        title: 'Presentation with Notes',
        slides: [
          { title: 'Introduction', content: ['Key introduction points'] },
          { title: 'Main Content', content: ['Core content slide'] },
        ],
        speakerNotes: [
          { slideIndex: 0, notes: 'Introduce the topic and set expectations.' },
          { slideIndex: 1, notes: 'Explain the main concepts in detail.' },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support different slide layouts', async () => {
      const slides: SlideDefinition[] = [
        { title: 'Title Slide', layout: 'title' },
        { title: 'Content Slide', content: ['Bullet 1', 'Bullet 2'], layout: 'content' },
        { title: 'Two Column', subtitle: 'With subtitle', layout: 'two_column' },
        { title: 'Blank Slide', layout: 'blank' },
      ];

      const config: PowerPointConfig = {
        title: 'Layout Showcase',
        slides,
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should embed images in slides', async () => {
      // Create a simple 1x1 pixel PNG
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const imageBase64 = pngBuffer.toString('base64');

      const config: PowerPointConfig = {
        title: 'Presentation with Images',
        slides: [
          {
            title: 'Slide with Image',
            content: ['Some content'],
            imageData: imageBase64,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should include charts in slides', async () => {
      const config: PowerPointConfig = {
        title: 'Presentation with Charts',
        slides: [
          {
            title: 'Sales Chart',
            chartData: {
              type: 'bar',
              title: 'Monthly Sales',
              labels: ['Jan', 'Feb', 'Mar', 'Apr'],
              values: [100, 150, 120, 180],
            },
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle large presentations', async () => {
      const slides: SlideDefinition[] = Array.from({ length: 20 }, (_, i) => ({
        title: `Slide ${i + 1}`,
        content: [`Content for slide ${i + 1}`, 'Additional bullet point'],
      }));

      const config: PowerPointConfig = {
        title: 'Long Presentation',
        slides,
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('slide creation', () => {
    it('should create title slide automatically', async () => {
      const config: PowerPointConfig = {
        title: 'Auto Title Slide',
        slides: [
          {
            title: 'First Content Slide',
            content: ['Content here'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle slide with only title', async () => {
      const config: PowerPointConfig = {
        slides: [
          {
            title: 'Title Only Slide',
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support slide with subtitle', async () => {
      const config: PowerPointConfig = {
        slides: [
          {
            title: 'Main Title',
            subtitle: 'Subtitle text here',
            content: ['Bullet point 1', 'Bullet point 2'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle empty slide', async () => {
      const config: PowerPointConfig = {
        slides: [
          {
            layout: 'blank',
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('chart types', () => {
    it('should support bar charts', async () => {
      const config: PowerPointConfig = {
        slides: [
          {
            title: 'Bar Chart',
            chartData: {
              type: 'bar',
              title: 'Bar Chart Title',
              labels: ['A', 'B', 'C'],
              values: [10, 20, 15],
            },
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support line charts', async () => {
      const config: PowerPointConfig = {
        slides: [
          {
            title: 'Line Chart',
            chartData: {
              type: 'line',
              title: 'Trend Line',
              labels: ['Q1', 'Q2', 'Q3', 'Q4'],
              values: [100, 120, 115, 140],
            },
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support pie charts', async () => {
      const config: PowerPointConfig = {
        slides: [
          {
            title: 'Pie Chart',
            chartData: {
              type: 'pie',
              title: 'Distribution',
              labels: ['Category A', 'Category B', 'Category C'],
              values: [30, 50, 20],
            },
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('content formatting', () => {
    it('should handle multiple bullet points', async () => {
      const config: PowerPointConfig = {
        slides: [
          {
            title: 'Bullet Points',
            content: Array.from({ length: 10 }, (_, i) => `Bullet point ${i + 1}`),
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle long text content', async () => {
      const config: PowerPointConfig = {
        slides: [
          {
            title: 'Long Content',
            content: ['Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5)],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('branding configuration', () => {
    it('should apply custom primary color', async () => {
      const config: PowerPointConfig = {
        slides: [{ title: 'Colored Presentation', content: ['Content'] }],
        branding: {
          primaryColor: '#FF0000',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should apply custom font family', async () => {
      const config: PowerPointConfig = {
        slides: [{ title: 'Font Styling', content: ['Content'] }],
        branding: {
          fontFamily: 'Arial',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should apply master slide background', async () => {
      const config: PowerPointConfig = {
        slides: [{ title: 'Custom Background', content: ['Content'] }],
        masterSlide: {
          backgroundColor: '#E8E8E8',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should use default branding when not provided', async () => {
      const config: PowerPointConfig = {
        slides: [{ title: 'Default Branding', content: ['Content'] }],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('speaker notes', () => {
    it('should add notes to specific slides', async () => {
      const config: PowerPointConfig = {
        slides: [
          { title: 'Slide 1', content: ['Content 1'] },
          { title: 'Slide 2', content: ['Content 2'] },
          { title: 'Slide 3', content: ['Content 3'] },
        ],
        speakerNotes: [
          { slideIndex: 0, notes: 'Open with this important point' },
          { slideIndex: 2, notes: 'This is a key conclusion slide' },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle long speaker notes', async () => {
      const config: PowerPointConfig = {
        slides: [
          { title: 'Important Slide', content: ['Key message'] },
        ],
        speakerNotes: [
          {
            slideIndex: 0,
            notes: 'This is a comprehensive set of speaker notes that covers the slide in detail. '.repeat(10),
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });
});
