/**
 * Document Delivery Service
 * Requirement 27.7 & 27.8: Deliver documents via email, download, webhook, DMS
 */

import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  DeliveryConfig,
  DeliveryResult,
} from '../interfaces/document-generation.interfaces';

/** Temporary download store in-process (production: replace with object storage URL) */
const downloadStore = new Map<string, { buffer: Buffer; filename: string; expiresAt: Date }>();

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  /**
   * Deliver document buffer via the configured method
   * Requirements 27.7, 27.8
   */
  async deliverDocument(
    buffer: Buffer,
    format: string,
    delivery: DeliveryConfig,
  ): Promise<DeliveryResult> {
    this.logger.log(`Delivering ${format.toUpperCase()} document via ${delivery.method}`);

    switch (delivery.method) {
      case 'email':
        return this.deliverEmail(buffer, format, delivery);
      case 'download':
        return this.deliverDownload(buffer, format, delivery);
      case 'webhook':
        return this.deliverWebhook(buffer, format, delivery);
      case 'dms_integration':
        return this.deliverDms(buffer, format, delivery);
      default:
        return {
          success: false,
          method: delivery.method,
          deliveredAt: new Date(),
          error: `Unknown delivery method: ${delivery.method}`,
        };
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────

  private async deliverEmail(
    buffer: Buffer,
    format: string,
    delivery: DeliveryConfig,
  ): Promise<DeliveryResult> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.warn('SMTP not configured — email delivery skipped (no SMTP_HOST/USER/PASS)');
      return {
        success: false,
        method: 'email',
        deliveredAt: new Date(),
        error: 'SMTP credentials not configured',
      };
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const filename = delivery.filename || `document.${format.toLowerCase()}`;
    const recipients = delivery.recipients?.join(', ') || '';

    const info = await transporter.sendMail({
      from: smtpUser,
      to: recipients,
      subject: delivery.subject || 'Your document is ready',
      text: delivery.message || 'Please find your document attached.',
      attachments: [
        {
          filename,
          content: buffer,
          contentType: this.getMimeType(format),
        },
      ],
    });

    this.logger.log(`Email sent to ${recipients} (messageId: ${info.messageId})`);
    return {
      success: true,
      method: 'email',
      deliveredAt: new Date(),
      messageId: info.messageId,
    };
  }

  // ── Download Link ─────────────────────────────────────────────────────

  private deliverDownload(
    buffer: Buffer,
    format: string,
    delivery: DeliveryConfig,
  ): DeliveryResult {
    const token = crypto.randomBytes(16).toString('hex');
    const filename = delivery.filename || `document.${format.toLowerCase()}`;
    const expiryMinutes = delivery.expiryDuration || 60;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    downloadStore.set(token, { buffer, filename, expiresAt });

    // Schedule cleanup
    setTimeout(() => downloadStore.delete(token), expiryMinutes * 60 * 1000);

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3009';
    const downloadUrl = `${baseUrl}/api/v1/documents/download/${token}`;

    this.logger.log(`Download link created: ${downloadUrl} (expires ${expiresAt.toISOString()})`);

    return {
      success: true,
      method: 'download',
      deliveredAt: new Date(),
      downloadUrl,
    };
  }

  // ── Webhook ───────────────────────────────────────────────────────────

  private async deliverWebhook(
    buffer: Buffer,
    format: string,
    delivery: DeliveryConfig,
  ): Promise<DeliveryResult> {
    if (!delivery.webhookUrl) {
      return {
        success: false,
        method: 'webhook',
        deliveredAt: new Date(),
        error: 'webhookUrl not provided',
      };
    }

    const response = await axios.post(
      delivery.webhookUrl,
      {
        filename: delivery.filename || `document.${format.toLowerCase()}`,
        format,
        sizeBytes: buffer.length,
        contentBase64: buffer.toString('base64'),
        deliveredAt: new Date().toISOString(),
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15_000,
      },
    );

    this.logger.log(`Webhook delivered to ${delivery.webhookUrl} — status ${response.status}`);

    return {
      success: response.status >= 200 && response.status < 300,
      method: 'webhook',
      deliveredAt: new Date(),
    };
  }

  // ── DMS Integration ───────────────────────────────────────────────────

  private deliverDms(
    buffer: Buffer,
    format: string,
    delivery: DeliveryConfig,
  ): DeliveryResult {
    const dmsPath = delivery.dmsPath || './dms-output';
    const filename = delivery.filename || `document-${Date.now()}.${format.toLowerCase()}`;

    try {
      const fullPath = path.join(dmsPath, filename);
      fs.mkdirSync(dmsPath, { recursive: true });
      fs.writeFileSync(fullPath, buffer);

      this.logger.log(`DMS integration: document saved to ${fullPath}`);

      return {
        success: true,
        method: 'dms_integration',
        deliveredAt: new Date(),
        downloadUrl: fullPath,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`DMS delivery failed: ${msg}`);
      return {
        success: false,
        method: 'dms_integration',
        deliveredAt: new Date(),
        error: msg,
      };
    }
  }

  // ── Download retrieval ────────────────────────────────────────────────

  /**
   * Retrieve a pending download by token (used by the download controller)
   */
  retrieveDownload(
    token: string,
  ): { buffer: Buffer; filename: string } | null {
    const entry = downloadStore.get(token);
    if (!entry) return null;
    if (new Date() > entry.expiresAt) {
      downloadStore.delete(token);
      return null;
    }
    return { buffer: entry.buffer, filename: entry.filename };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private getMimeType(format: string): string {
    const map: Record<string, string> = {
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
    };
    return map[format.toLowerCase()] || 'application/octet-stream';
  }
}
