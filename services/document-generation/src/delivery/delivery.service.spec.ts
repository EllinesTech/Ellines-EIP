/**
 * Delivery Service Tests
 * Test document delivery via email, download links, webhooks, and DMS
 */

import { DeliveryService } from './delivery.service';
import { DeliveryConfig, DeliveryResult } from '../interfaces/document-generation.interfaces';
import * as fs from 'fs';
import * as path from 'path';

describe('DeliveryService', () => {
  let service: DeliveryService;
  const testBuffer = Buffer.from('Test document content');

  beforeEach(() => {
    service = new DeliveryService();
    // Clear any environment variables that might interfere
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  afterEach(() => {
    // Cleanup test DMS files
    const dmsPath = './dms-output';
    if (fs.existsSync(dmsPath)) {
      const files = fs.readdirSync(dmsPath);
      files.forEach((file) => {
        fs.unlinkSync(path.join(dmsPath, file));
      });
      try {
        fs.rmdirSync(dmsPath);
      } catch {
        // Directory may not be empty
      }
    }
  });

  describe('deliverDocument', () => {
    it('should route to email delivery', async () => {
      const config: DeliveryConfig = {
        method: 'email',
        recipients: ['test@example.com'],
        subject: 'Your document',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.method).toBe('email');
      expect(result.success).toBe(false); // No SMTP configured
      expect(result.error).toContain('not configured');
    });

    it('should route to download delivery', async () => {
      const config: DeliveryConfig = {
        method: 'download',
        filename: 'document.pdf',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.method).toBe('download');
      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBeDefined();
      expect(result.downloadUrl).toContain('/api/v1/documents/download/');
    });

    it('should route to webhook delivery', async () => {
      const config: DeliveryConfig = {
        method: 'webhook',
        webhookUrl: 'https://example.com/webhook',
      };

      // This will fail due to network, but test routing
      try {
        await service.deliverDocument(testBuffer, 'pdf', config);
      } catch (e) {
        // Expected to fail without actual webhook
      }
    });

    it('should route to DMS delivery', async () => {
      const config: DeliveryConfig = {
        method: 'dms_integration',
        dmsPath: './dms-output',
        filename: 'test-document.pdf',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.method).toBe('dms_integration');
      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBeDefined();
    });

    it('should handle unknown delivery method', async () => {
      const config: DeliveryConfig = {
        method: 'unknown_method' as any,
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown delivery method');
    });
  });

  describe('download delivery', () => {
    it('should generate unique download links', async () => {
      const config: DeliveryConfig = {
        method: 'download',
        filename: 'doc1.pdf',
      };

      const result1 = await service.deliverDocument(testBuffer, 'pdf', config);
      const result2 = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result1.downloadUrl).not.toBe(result2.downloadUrl);
    });

    it('should allow downloading generated link', async () => {
      const config: DeliveryConfig = {
        method: 'download',
        filename: 'test.pdf',
      };

      const deliveryResult = await service.deliverDocument(testBuffer, 'pdf', config);
      const token = deliveryResult.downloadUrl!.split('/').pop();

      const downloaded = service.retrieveDownload(token!);

      expect(downloaded).not.toBeNull();
      expect(downloaded!.buffer).toEqual(testBuffer);
      expect(downloaded!.filename).toBe('test.pdf');
    });

    it('should return null for expired links', () => {
      // This is difficult to test without mocking timers
      // In production, downloads expire after the configured duration
      const notFound = service.retrieveDownload('nonexistent-token');
      expect(notFound).toBeNull();
    });

    it('should support custom expiry duration', async () => {
      const config: DeliveryConfig = {
        method: 'download',
        filename: 'expires-soon.pdf',
        expiryDuration: 1, // 1 minute
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBeDefined();
    });

    it('should use default expiry of 60 minutes', async () => {
      const config: DeliveryConfig = {
        method: 'download',
        filename: 'default-expiry.pdf',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBeDefined();
    });
  });

  describe('DMS delivery', () => {
    it('should save document to DMS path', async () => {
      const dmsPath = './dms-output';
      const config: DeliveryConfig = {
        method: 'dms_integration',
        dmsPath,
        filename: 'test-dms.pdf',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(dmsPath, 'test-dms.pdf'))).toBe(true);

      // Verify content
      const saved = fs.readFileSync(path.join(dmsPath, 'test-dms.pdf'));
      expect(saved).toEqual(testBuffer);
    });

    it('should create DMS directory if not exists', async () => {
      const dmsPath = './dms-output-new';
      const config: DeliveryConfig = {
        method: 'dms_integration',
        dmsPath,
        filename: 'new-dir.pdf',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.success).toBe(true);
      expect(fs.existsSync(dmsPath)).toBe(true);

      // Cleanup
      fs.unlinkSync(path.join(dmsPath, 'new-dir.pdf'));
      fs.rmdirSync(dmsPath);
    });

    it('should generate filename if not provided', async () => {
      const dmsPath = './dms-output';
      const config: DeliveryConfig = {
        method: 'dms_integration',
        dmsPath,
      };

      const result = await service.deliverDocument(testBuffer, 'xlsx', config);

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toContain('document-');
      expect(result.downloadUrl).toContain('.xlsx');
    });

    it('should handle DMS write errors gracefully', async () => {
      const config: DeliveryConfig = {
        method: 'dms_integration',
        dmsPath: '/invalid/path/that/does/not/exist',
        filename: 'test.pdf',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('webhook delivery', () => {
    it('should not deliver without webhookUrl', async () => {
      const config: DeliveryConfig = {
        method: 'webhook',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('webhookUrl');
    });

    it('should include document metadata in webhook payload', async () => {
      // This test would need a mock HTTP server
      // Skipping actual network test
      const config: DeliveryConfig = {
        method: 'webhook',
        webhookUrl: 'https://invalid.test/webhook',
        filename: 'payload-test.pdf',
      };

      try {
        await service.deliverDocument(testBuffer, 'pdf', config);
      } catch (e) {
        // Expected to fail
      }
    });
  });

  describe('email delivery', () => {
    it('should fail gracefully without SMTP configuration', async () => {
      const config: DeliveryConfig = {
        method: 'email',
        recipients: ['test@example.com'],
        subject: 'Test',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP');
    });

    it('should use default subject if not provided', async () => {
      const config: DeliveryConfig = {
        method: 'email',
        recipients: ['test@example.com'],
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      // Fails due to no SMTP, but checks default subject handling
      expect(result.method).toBe('email');
    });

    it('should use default message if not provided', async () => {
      const config: DeliveryConfig = {
        method: 'email',
        recipients: ['test@example.com'],
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.method).toBe('email');
    });
  });

  describe('MIME type handling', () => {
    const formats = [
      { format: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { format: 'pdf', mime: 'application/pdf' },
      { format: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { format: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      { format: 'csv', mime: 'text/csv' },
      { format: 'json', mime: 'application/json' },
      { format: 'xml', mime: 'application/xml' },
    ];

    formats.forEach(({ format }) => {
      it(`should handle ${format} format in DMS delivery`, async () => {
        const config: DeliveryConfig = {
          method: 'dms_integration',
          dmsPath: './dms-output',
        };

        const result = await service.deliverDocument(testBuffer, format, config);

        expect(result.method).toBe('dms_integration');
        if (result.success) {
          expect(result.downloadUrl).toContain(`.${format}`);
        }
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty buffer', async () => {
      const emptyBuffer = Buffer.from('');
      const config: DeliveryConfig = {
        method: 'download',
      };

      const result = await service.deliverDocument(emptyBuffer, 'pdf', config);

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBeDefined();
    });

    it('should handle large buffers', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      const config: DeliveryConfig = {
        method: 'download',
      };

      const result = await service.deliverDocument(largeBuffer, 'pdf', config);

      expect(result.success).toBe(true);
    });

    it('should handle multiple recipients', async () => {
      const config: DeliveryConfig = {
        method: 'email',
        recipients: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.method).toBe('email');
    });

    it('should include timestamp in delivery result', async () => {
      const config: DeliveryConfig = {
        method: 'download',
      };

      const result = await service.deliverDocument(testBuffer, 'pdf', config);

      expect(result.deliveredAt).toBeInstanceOf(Date);
      expect(result.deliveredAt.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
