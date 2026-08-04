import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorTemplate, Prisma } from '@prisma/client';

@Injectable()
export class TemplateService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all connector templates (with optional filtering)
   */
  async listTemplates(
    category?: string,
    published = true,
  ): Promise<ConnectorTemplate[]> {
    const where: Prisma.ConnectorTemplateWhereInput = {
      published,
      ...(category && { category }),
    };

    return this.prisma.connectorTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get templates by category
   */
  async getByCategory(category: string): Promise<ConnectorTemplate[]> {
    return this.prisma.connectorTemplate.findMany({
      where: { category, published: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get a single template by ID
   */
  async getById(id: string): Promise<ConnectorTemplate> {
    const template = await this.prisma.connectorTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return template;
  }

  /**
   * Get a single template by slug
   */
  async getBySlug(slug: string): Promise<ConnectorTemplate> {
    const template = await this.prisma.connectorTemplate.findUnique({
      where: { slug },
    });

    if (!template) {
      throw new NotFoundException(`Template ${slug} not found`);
    }

    return template;
  }

  /**
   * Get the configuration schema for a template
   */
  async getConfigSchema(id: string): Promise<Record<string, any>> {
    const template = await this.getById(id);
    return template.configSchema as Record<string, any>;
  }

  /**
   * Create a new connector installation from a template
   */
  async installFromTemplate(
    organizationId: string,
    templateId: string,
    templateConfig: Record<string, any>,
    displayName: string,
  ) {
    const template = await this.getById(templateId);
    const schema = template.configSchema as Record<string, any> | null;

    // Merge user config with template defaults
    const mergedConfig = {
      ...(schema?.['default'] ?? {}),
      ...templateConfig,
    };

    // Create the installation
    const installation = await this.prisma.connectorInstallation.create({
      data: {
        organizationId,
        templateId,
        templateConfig: mergedConfig,
        catalogId: template.slug,
        displayName: displayName || template.name,
        config: mergedConfig,
        status: 'draft',
      },
    });

    return installation;
  }

  /**
   * Test a template connection
   */
  async testTemplate(
    templateId: string,
    config: Record<string, any>,
  ): Promise<{ success: boolean; message: string }> {
    const template = await this.getById(templateId);

    try {
      // Placeholder: In production, this would actually test the connection
      // based on template type (REST, DB, OAuth, etc.)
      if (!config || Object.keys(config).length === 0) {
        throw new BadRequestException('Configuration is empty');
      }

      return {
        success: true,
        message: `Template ${template.name} connection test passed`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Connection test failed',
      };
    }
  }

  /**
   * Create a new template (Admin only)
   */
  async create(
    input: Omit<ConnectorTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConnectorTemplate> {
    return this.prisma.connectorTemplate.create({
      data: input as any,
    });
  }

  /**
   * Update a template (Admin only)
   */
  async update(
    id: string,
    input: Partial<Omit<ConnectorTemplate, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ConnectorTemplate> {
    return this.prisma.connectorTemplate.update({
      where: { id },
      data: input as any,
    });
  }

  /**
   * Delete a template (Admin only)
   */
  async delete(id: string): Promise<void> {
    await this.prisma.connectorTemplate.delete({
      where: { id },
    });
  }
}
