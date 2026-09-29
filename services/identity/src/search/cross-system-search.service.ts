/**
 * CrossSystemSearchService — Task 17.1
 *
 * Fan-out search across Prisma models (EnterpriseSnapshot, AuditLog,
 * ApprovalRequest, User) plus a placeholder for Neo4j/InfluxDB.
 *
 * Requirements 33.x: Cross-System Search
 *
 * Design constraints:
 *  - Every query includes a mandatory `organizationId` equality filter (Security §6).
 *  - External DB calls are wrapped in non-fatal try/catch.
 *  - No plaintext credentials ever appear in results.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Public types ─────────────────────────────────────────────────────────────

export type SearchResult = {
  id: string;
  type: string;
  title: string;
  summary: string;
  sourceSystem: string;
  relevanceScore: number;
  url?: string;
  createdAt: Date;
};

export interface SearchRefinements {
  sourceSystem?: string;
  type?: string;
  from?: Date;
  to?: Date;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CrossSystemSearchService {
  private readonly logger = new Logger(CrossSystemSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 1. Full search ──────────────────────────────────────────────────────────

  /**
   * Fan-out search across Prisma tables and external data stores.
   * Results are merged and ranked by recency.
   *
   * Requirement 33.1: Cross-system full-text search
   */
  async search(query: string, orgId: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Run Prisma searches in parallel
    const [snapshotResults, auditResults, approvalResults, userResults] =
      await Promise.allSettled([
        this.searchEnterpriseSnapshots(trimmed, orgId),
        this.searchAuditLogs(trimmed, orgId),
        this.searchApprovalRequests(trimmed, orgId),
        this.searchUsers(trimmed, orgId),
      ]);

    const prismaResults: SearchResult[] = [
      ...this.settle(snapshotResults, 'EnterpriseSnapshot'),
      ...this.settle(auditResults, 'AuditLog'),
      ...this.settle(approvalResults, 'ApprovalRequest'),
      ...this.settle(userResults, 'User'),
    ];

    // Placeholder for Neo4j (knowledge graph) — non-fatal
    let neo4jResults: SearchResult[] = [];
    try {
      neo4jResults = await this.searchNeo4j(trimmed, orgId);
    } catch (err) {
      this.logger.debug(`search: Neo4j unavailable: ${(err as Error).message}`);
    }

    // Placeholder for InfluxDB (time-series) — non-fatal
    let influxResults: SearchResult[] = [];
    try {
      influxResults = await this.searchInfluxDB(trimmed, orgId);
    } catch (err) {
      this.logger.debug(`search: InfluxDB unavailable: ${(err as Error).message}`);
    }

    const all = [...prismaResults, ...neo4jResults, ...influxResults];

    // Rank by recency (most recent first) then by naive term-match score
    all.sort((a, b) => {
      const scoreDiff = b.relevanceScore - a.relevanceScore;
      if (scoreDiff !== 0) return scoreDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return all;
  }

  // ── 2. Suggestions ──────────────────────────────────────────────────────────

  /**
   * Simple prefix match on recent audit log actions/resources for the org.
   *
   * Requirement 33.2: Search suggestions / autocomplete
   */
  async getSuggestions(partial: string, orgId: string): Promise<string[]> {
    const trimmed = partial.trim().toLowerCase();
    if (trimmed.length < 2) return [];

    const recentLogs = await this.prisma.auditLog.findMany({
      where: { organizationId: orgId },
      select: { action: true, resource: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const log of recentLogs) {
      for (const term of [log.action, log.resource]) {
        if (!term) continue;
        const lc = term.toLowerCase();
        if (lc.startsWith(trimmed) && !seen.has(lc)) {
          seen.add(lc);
          suggestions.push(term);
          if (suggestions.length >= 10) return suggestions;
        }
      }
    }

    return suggestions;
  }

  // ── 3. Refine results ───────────────────────────────────────────────────────

  /**
   * Filter an existing result set by facets (sourceSystem, type, date range).
   *
   * Requirement 33.3: Search facet refinement
   */
  refineResults(results: SearchResult[], refinements: SearchRefinements): SearchResult[] {
    let filtered = results;

    if (refinements.sourceSystem) {
      filtered = filtered.filter(
        (r) =>
          r.sourceSystem.toLowerCase() === refinements.sourceSystem!.toLowerCase(),
      );
    }

    if (refinements.type) {
      filtered = filtered.filter(
        (r) => r.type.toLowerCase() === refinements.type!.toLowerCase(),
      );
    }

    if (refinements.from) {
      filtered = filtered.filter((r) => r.createdAt >= refinements.from!);
    }

    if (refinements.to) {
      filtered = filtered.filter((r) => r.createdAt <= refinements.to!);
    }

    return filtered;
  }

  // ── Private Prisma searches ─────────────────────────────────────────────────

  private async searchEnterpriseSnapshots(
    query: string,
    orgId: string,
  ): Promise<SearchResult[]> {
    const rows = await this.prisma.enterpriseSnapshot.findMany({
      where: {
        organizationId: orgId,
      },
      select: {
        id: true,
        connectorName: true,
        briefHighlight: true,
        healthScore: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const lq = query.toLowerCase();

    return rows
      .filter((r) => {
        const blob = `${r.connectorName} ${r.briefHighlight}`.toLowerCase();
        return blob.includes(lq);
      })
      .slice(0, 10)
      .map((r): SearchResult => ({
        id: r.id,
        type: 'snapshot',
        title: `Enterprise Snapshot — ${r.connectorName}`,
        summary: r.briefHighlight || `Health score: ${r.healthScore}`,
        sourceSystem: 'EIP',
        relevanceScore: this.scoreTermMatch(`${r.connectorName} ${r.briefHighlight}`, query),
        url: '/app/org-system',
        createdAt: r.createdAt,
      }));
  }

  private async searchAuditLogs(query: string, orgId: string): Promise<SearchResult[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { action: { contains: query, mode: 'insensitive' } },
          { resource: { contains: query, mode: 'insensitive' } },
          { userId: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return rows.map((r): SearchResult => ({
      id: r.id,
      type: 'audit_log',
      title: `${r.action}${r.resource ? ` · ${r.resource}` : ''}`,
      summary: r.userId ? `by ${r.userId}` : 'system action',
      sourceSystem: 'EIP',
      relevanceScore: this.scoreTermMatch(`${r.action} ${r.resource ?? ''}`, query),
      url: '/app/audit',
      createdAt: r.createdAt,
    }));
  }

  private async searchApprovalRequests(
    query: string,
    orgId: string,
  ): Promise<SearchResult[]> {
    const rows = await this.prisma.approvalRequest.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { detail: { contains: query, mode: 'insensitive' } },
          { requester: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return rows.map((r): SearchResult => ({
      id: r.id,
      type: 'approval_request',
      title: r.title,
      summary: r.detail ? r.detail.slice(0, 120) : `Status: ${r.status}`,
      sourceSystem: 'EIP',
      relevanceScore: this.scoreTermMatch(`${r.title} ${r.detail ?? ''}`, query),
      url: '/app/approvals',
      createdAt: r.createdAt,
    }));
  }

  private async searchUsers(query: string, orgId: string): Promise<SearchResult[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
      take: 10,
    });

    return rows.map((r): SearchResult => ({
      id: r.id,
      type: 'user',
      title: r.fullName || r.email,
      summary: `${r.role} · ${r.email}`,
      sourceSystem: 'EIP',
      relevanceScore: this.scoreTermMatch(`${r.fullName ?? ''} ${r.email}`, query),
      url: '/app/people',
      createdAt: r.createdAt,
    }));
  }

  // ── Placeholder external searches ──────────────────────────────────────────

  /**
   * Neo4j knowledge-graph search — throws until integrated.
   */
  private async searchNeo4j(
    _query: string,
    _orgId: string,
  ): Promise<SearchResult[]> {
    throw new Error('Neo4j not configured');
    return [];
  }

  /**
   * InfluxDB time-series search — throws until integrated.
   */
  private async searchInfluxDB(
    _query: string,
    _orgId: string,
  ): Promise<SearchResult[]> {
    throw new Error('InfluxDB not configured');
    return [];
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /**
   * Unwrap a settled Prisma result; log failures and return [].
   */
  private settle(
    result: PromiseSettledResult<SearchResult[]>,
    label: string,
  ): SearchResult[] {
    if (result.status === 'fulfilled') return result.value;
    this.logger.warn(`search: ${label} failed: ${result.reason?.message ?? result.reason}`);
    return [];
  }

  /**
   * Naive term-frequency relevance score (0–100).
   */
  private scoreTermMatch(text: string, query: string): number {
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase().trim();
    if (!needle) return 0;

    const terms = needle.split(/\s+/);
    const matchCount = terms.filter((t) => haystack.includes(t)).length;
    return Math.round((matchCount / terms.length) * 100);
  }
}
