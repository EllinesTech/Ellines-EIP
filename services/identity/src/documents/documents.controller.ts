import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  DocumentConfig,
  DocumentFormat,
  DocumentGenerationService,
} from './document-generation.service';
import { PrismaService } from '../prisma/prisma.service';

interface AuthRequest {
  user: {
    userId: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

interface GenerateDocumentDto {
  format: DocumentFormat;
  config: {
    title: string;
    data?: Record<string, unknown>[];
    columns?: string[];
  };
  delivery?: 'download' | 'webhook';
  callbackUrl?: string;
}

/**
 * DocumentsController — EIP 2.0 Task 13.3
 *
 * Routes (all under /api/v1/orgs prefix via the identity service):
 *   POST /documents/generate      — generate and deliver a document
 *   GET  /documents               — list generated documents for the org
 *   GET  /documents/:id/download  — retrieve document metadata / stream
 *
 * Security:
 *   - All routes require a valid JWT (JwtAuthGuard).
 *   - organizationId is sourced exclusively from the JWT — never from the
 *     request body — to satisfy tenant isolation rule §6.
 *
 * Requirements: 26.1–26.3, 27.1–27.8
 */
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documentService: DocumentGenerationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /api/v1/documents/generate
   *
   * Accepts: { format, config: { title, data?, columns? }, delivery?, callbackUrl? }
   * Returns: { downloadUrl?, delivered, format, title }
   *
   * Requirement 26.1, 27.1
   */
  @Post('generate')
  async generate(@Body() body: GenerateDocumentDto, @Req() req: AuthRequest) {
    const orgId = req.user.organizationId;

    const config: DocumentConfig = {
      title: body.config?.title ?? 'Document',
      format: body.format ?? 'pdf',
      data: body.config?.data,
      columns: body.config?.columns,
    };

    const delivery = body.delivery ?? 'download';

    let buffer: Buffer;
    try {
      switch (config.format) {
        case 'excel':
          buffer = await this.documentService.generateExcel(config, orgId);
          break;
        case 'pdf':
          buffer = await this.documentService.generatePDF(config, orgId);
          break;
        case 'word':
          buffer = await this.documentService.generateWord(config, orgId);
          break;
        case 'pptx':
          buffer = await this.documentService.generatePowerPoint(config, orgId);
          break;
        default:
          buffer = await this.documentService.generatePDF(config, orgId);
      }
    } catch (err) {
      this.logger.error('generate: document generation failed', err);
      return {
        success: false,
        error: 'Document generation failed',
      };
    }

    const result = await this.documentService.deliverDocument(
      buffer,
      config,
      orgId,
      delivery,
      body.callbackUrl,
    );

    return {
      success: true,
      format: config.format,
      title: config.title,
      ...result,
    };
  }

  /**
   * GET /api/v1/documents
   *
   * Lists all documents generated for the authenticated user's organisation.
   * organizationId comes from JWT — mandatory tenant filter (rule §6).
   *
   * Requirement 27.5
   */
  @Get()
  async list(@Req() req: AuthRequest) {
    const orgId = req.user.organizationId;

    try {
      const docs = await this.prisma.document.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          summary: true,
          uploadedBy: true,
          createdAt: true,
        },
      });

      return {
        success: true,
        data: docs.map((d) => {
          // Parse summary JSON to expose format / title / expiresAt cleanly.
          let meta: Record<string, unknown> = {};
          try {
            if (typeof d.summary === 'string') {
              meta = JSON.parse(d.summary) as Record<string, unknown>;
            }
          } catch {
            // summary is not JSON — leave meta empty
          }

          return {
            id: d.id,
            fileName: d.name,
            format: meta.format ?? null,
            title: meta.title ?? d.name,
            mimeType: d.mimeType,
            fileSize: d.sizeBytes,
            generatedBy: d.uploadedBy,
            expiresAt: meta.expiresAt ?? null,
            createdAt: d.createdAt,
            downloadUrl: `/api/v1/documents/${d.id}/download`,
          };
        }),
      };
    } catch (err) {
      this.logger.error('list documents failed', err);
      return {
        success: false,
        error: 'Failed to list documents',
      };
    }
  }

  /**
   * GET /api/v1/documents/:id/download
   *
   * Returns document metadata and a signed confirmation that the document
   * exists for this org.  Full binary streaming is a v1.1 enhancement that
   * requires a dedicated storage provider (S3/R2).  For now, this endpoint
   * returns metadata so downstream clients can poll or handle the binary via
   * a separate mechanism.
   *
   * The mandatory `organizationId` filter ensures cross-tenant isolation (§6).
   *
   * Requirement 27.6
   */
  @Get(':id/download')
  async download(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.user.organizationId;

    try {
      const doc = await this.prisma.document.findFirst({
        where: {
          id,
          organizationId: orgId, // mandatory tenant isolation filter
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          summary: true,
          uploadedBy: true,
          createdAt: true,
        },
      });

      if (!doc) {
        return { success: false, error: 'Document not found' };
      }

      let meta: Record<string, unknown> = {};
      try {
        if (typeof doc.summary === 'string') {
          meta = JSON.parse(doc.summary) as Record<string, unknown>;
        }
      } catch {
        // non-JSON summary
      }

      // Check expiry if present.
      if (meta.expiresAt && new Date(meta.expiresAt as string) < new Date()) {
        return { success: false, error: 'Document has expired' };
      }

      return {
        success: true,
        data: {
          id: doc.id,
          fileName: doc.name,
          format: meta.format ?? null,
          title: meta.title ?? doc.name,
          mimeType: doc.mimeType,
          fileSize: doc.sizeBytes,
          generatedBy: doc.uploadedBy,
          expiresAt: meta.expiresAt ?? null,
          createdAt: doc.createdAt,
          // storageUrl is 'pending' — binary streaming requires a storage provider
          storageUrl: meta.storageUrl ?? 'pending',
        },
      };
    } catch (err) {
      this.logger.error(`download document ${id} failed`, err);
      return { success: false, error: 'Failed to retrieve document' };
    }
  }
}
