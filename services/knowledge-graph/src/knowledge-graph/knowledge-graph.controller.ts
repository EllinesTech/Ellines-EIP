import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { KnowledgeGraphService } from './knowledge-graph.service';

@Controller('knowledge-graph')
export class KnowledgeGraphController {
  constructor(private readonly service: KnowledgeGraphService) {}

  @Get('health')
  async health() {
    const ping = await this.service.ping();
    return { status: 'ok', ...ping };
  }

  @Get('entities/:type')
  async getEntitiesByType(
    @Param('type') type: string,
    @Query('orgId') orgId: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.queryEntitiesByType(type, orgId, limit ? Number(limit) : 100);
  }

  @Post('entities')
  async upsertEntity(@Body() entity: any) {
    return this.service.upsertEntity(entity);
  }

  @Post('relationships')
  async createRelationship(@Body() rel: any) {
    await this.service.createRelationship(rel);
    return { status: 'created' };
  }

  @Post('query')
  async executeQuery(@Body() request: any) {
    return this.service.executeQuery(request);
  }

  @Get('subgraph/:entityId')
  async getSubgraph(
    @Param('entityId') entityId: string,
    @Query('depth') depth?: number,
  ) {
    return this.service.generateSubgraph(entityId, depth ? Number(depth) : 2);
  }

  @Get('duplicates/:type')
  async findDuplicates(
    @Param('type') type: string,
    @Query('orgId') orgId: string,
  ) {
    return this.service.findDuplicateEntities(orgId, type);
  }
}
