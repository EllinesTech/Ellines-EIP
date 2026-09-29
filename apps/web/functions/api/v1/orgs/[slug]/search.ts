/**
 * POST /api/v1/orgs/:slug/search
 *
 * Cross-system search across EIP data (EnterpriseSnapshot, AuditLog,
 * ApprovalRequest, User) for the authenticated user's organisation.
 *
 * Any authenticated role may search; results are always scoped to the
 * caller's organizationId from their JWT (Security §6 — tenant isolation).
 *
 * Request body:
 *   {
 *     query: string              — required, min 2 chars
 *     refinements?: {
 *       sourceSystem?: string
 *       type?: string
 *       from?: string            — ISO datetime
 *       to?: string              — ISO datetime
 *     }
 *   }
 *
 * Response shape:
 *   { results: SearchResult[], total: number }
 *
 * Requirements 33.x: Cross-System Search
 */

import { requireAuth, json, options, type Env } from '../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

interface SearchBody {
  query?: unknown;
  refinements?: {
    sourceSystem?: string;
    type?: string;
    from?: string;
    to?: string;
  };
}

interface SearchResult {
  id: string;
  type: string;
  title: string;
  summary: string;
  sourceSystem: string;
  relevanceScore: number;
  url?: string;
  createdAt: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Any authenticated role can search — mandatory org filter applied below
  const orgId = auth.organizationId;

  let body: SearchBody;
  try {
    body = (await context.request.json()) as SearchBody;
  } catch {
    return json({ message: 'Invalid JSON body' }, 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 2) {
    return json({ message: 'query must be at least 2 characters' }, 400);
  }

  const { getAdminClient } = await import('../../../../shared/auth');
  const supabase = getAdminClient(context.env);

  const lq = query.toLowerCase();
  const results: SearchResult[] = [];

  // ── 1. AuditLog (Supabase REST) ────────────────────────────────────────────
  try {
    const { data: logs } = await supabase
      .from('AuditLog')
      .select('id, action, resource, status, userId, createdAt')
      .eq('organizationId', orgId)
      .or(`action.ilike.%${query}%,resource.ilike.%${query}%`)
      .order('createdAt', { ascending: false })
      .limit(10);

    for (const r of logs ?? []) {
      results.push({
        id: r.id,
        type: 'audit_log',
        title: `${r.action} · ${r.resource}`,
        summary: `${r.status} · by ${r.userId}`,
        sourceSystem: 'EIP',
        relevanceScore: scoreMatch(`${r.action} ${r.resource}`, query),
        url: '/app/audit',
        createdAt: r.createdAt,
      });
    }
  } catch (err) {
    console.warn('[search] AuditLog query failed:', (err as Error).message);
  }

  // ── 2. ApprovalRequest ─────────────────────────────────────────────────────
  try {
    const { data: approvals } = await supabase
      .from('ApprovalRequest')
      .select('id, title, description, status, requestedBy, createdAt')
      .eq('organizationId', orgId)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      .order('createdAt', { ascending: false })
      .limit(10);

    for (const r of approvals ?? []) {
      results.push({
        id: r.id,
        type: 'approval_request',
        title: r.title,
        summary: r.description ? String(r.description).slice(0, 120) : `Status: ${r.status}`,
        sourceSystem: 'EIP',
        relevanceScore: scoreMatch(`${r.title} ${r.description ?? ''}`, query),
        url: '/app/approvals',
        createdAt: r.createdAt,
      });
    }
  } catch (err) {
    console.warn('[search] ApprovalRequest query failed:', (err as Error).message);
  }

  // ── 3. User ────────────────────────────────────────────────────────────────
  try {
    const { data: users } = await supabase
      .from('User')
      .select('id, name, email, role, createdAt')
      .eq('organizationId', orgId)
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);

    for (const r of users ?? []) {
      results.push({
        id: r.id,
        type: 'user',
        title: r.name || r.email,
        summary: `${r.role} · ${r.email}`,
        sourceSystem: 'EIP',
        relevanceScore: scoreMatch(`${r.name ?? ''} ${r.email}`, query),
        url: '/app/people',
        createdAt: r.createdAt,
      });
    }
  } catch (err) {
    console.warn('[search] User query failed:', (err as Error).message);
  }

  // Apply optional refinements
  const ref = body.refinements;
  let filtered = results;

  if (ref?.sourceSystem) {
    filtered = filtered.filter(
      (r) => r.sourceSystem.toLowerCase() === ref.sourceSystem!.toLowerCase(),
    );
  }
  if (ref?.type) {
    filtered = filtered.filter(
      (r) => r.type.toLowerCase() === ref.type!.toLowerCase(),
    );
  }
  if (ref?.from) {
    const fromDate = new Date(ref.from);
    if (!isNaN(fromDate.getTime())) {
      filtered = filtered.filter((r) => new Date(r.createdAt) >= fromDate);
    }
  }
  if (ref?.to) {
    const toDate = new Date(ref.to);
    if (!isNaN(toDate.getTime())) {
      filtered = filtered.filter((r) => new Date(r.createdAt) <= toDate);
    }
  }

  // Sort by relevance then recency
  filtered.sort((a, b) => {
    const scoreDiff = b.relevanceScore - a.relevanceScore;
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return json({ results: filtered, total: filtered.length });
};

function scoreMatch(text: string, query: string): number {
  const haystack = text.toLowerCase();
  const terms = query.toLowerCase().trim().split(/\s+/);
  const matches = terms.filter((t) => haystack.includes(t)).length;
  return Math.round((matches / terms.length) * 100);
}
