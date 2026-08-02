import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { TemplateService } from './template.service';

@Controller('api/v1/connectors/templates')
export class TemplateController {
  constructor(private templateService: TemplateService) {}

  /**
   * GET /api/v1/connectors/templates
   * List all templates (optionally filter by category)
   */
  @Get()
  async listTemplates(@Query('category') category?: string) {
    return this.templateService.listTemplates(category);
  }

  /**
   * GET /api/v1/connectors/templates/:id
   * Get a single template by ID
   */
  @Get(':id')
  async getTemplate(@Param('id') id: string) {
    return this.templateService.getById(id);
  }

  /**
   * GET /api/v1/connectors/templates/:id/schema
   * Get the configuration schema for a template
   */
  @Get(':id/schema')
  async getTemplateSchema(@Param('id') id: string) {
    return this.templateService.getConfigSchema(id);
  }

  /**
   * POST /api/v1/connectors/install-from-template
   * Install a connector from a template
   */
  @Post('install-from-template')
  async installFromTemplate(
    @Body()
    input: {
      organizationId: string;
      templateId: string;
      templateConfig: Record<string, any>;
      displayName?: string;
    },
  ) {
    return this.templateService.installFromTemplate(
      input.organizationId,
      input.templateId,
      input.templateConfig,
      input.displayName || '',
    );
  }

  /**
   * POST /api/v1/connectors/test-template
   * Test a template connection
   */
  @Post('test-template')
  async testTemplate(
    @Body()
    input: {
      templateId: string;
      config: Record<string, any>;
    },
  ) {
    return this.templateService.testTemplate(input.templateId, input.config);
  }

  /**
   * POST /api/v1/connectors/templates (Admin)
   * Create a new template
   */
  @Post()
  async createTemplate(@Body() input: any) {
    return this.templateService.create(input);
  }

  /**
   * PATCH /api/v1/connectors/templates/:id (Admin)
   * Update a template
   */
  @Patch(':id')
  async updateTemplate(@Param('id') id: string, @Body() input: any) {
    return this.templateService.update(id, input);
  }

  /**
   * DELETE /api/v1/connectors/templates/:id (Admin)
   * Delete a template
   */
  @Delete(':id')
  async deleteTemplate(@Param('id') id: string) {
    await this.templateService.delete(id);
    return { ok: true };
  }
}
