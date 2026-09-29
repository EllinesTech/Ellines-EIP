/**
 * SearchController — Task 17.4
 *
 * Exposes cross-system search endpoints for the NestJS identity service.
 *
 * POST /search          — full fan-out search
 * GET  /search/suggestions — prefix-based autocomplete
 *
 * Requirements 33.x: Cross-System Search
 * Security §6: All queries are scoped to the caller's organizationId.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Request,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import {
  CrossSystemSearchService,
  type SearchResult,
  type SearchRefinements,
} from './cross-system-search.service';

interface SearchRequestBody {
  query: string;
  refinements?: SearchRefinements;
}

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: CrossSystemSearchService) {}

  /**
   * POST /search
   *
   * Fan-out search across all connected data sources.
   * The organizationId is taken from the request user context (JWT); it is
   * never accepted from the request body — Security §6.
   */
  @Post()
  @HttpCode(200)
  async search(
    @Body() body: SearchRequestBody,
    @Request() req: { user: { organizationId: string } },
  ): Promise<{ results: SearchResult[]; total: number }> {
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (query.length < 2) {
      throw new BadRequestException('query must be at least 2 characters');
    }

    const orgId = req.user.organizationId;

    let results = await this.searchService.search(query, orgId);

    if (body.refinements) {
      results = this.searchService.refineResults(results, body.refinements);
    }

    return { results, total: results.length };
  }

  /**
   * GET /search/suggestions?partial=...
   *
   * Prefix-based autocomplete from recent audit log actions.
   */
  @Get('suggestions')
  async getSuggestions(
    @Query('partial') partial: string,
    @Request() req: { user: { organizationId: string } },
  ): Promise<{ suggestions: string[] }> {
    const trimmed = typeof partial === 'string' ? partial.trim() : '';
    if (trimmed.length < 2) {
      return { suggestions: [] };
    }

    const orgId = req.user.organizationId;
    const suggestions = await this.searchService.getSuggestions(trimmed, orgId);

    return { suggestions };
  }
}
