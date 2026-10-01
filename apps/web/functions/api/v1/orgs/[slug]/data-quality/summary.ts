/**
 * Pages Function: GET /api/v1/orgs/:slug/data-quality/summary
 *
 * Returns the latest DataQualityScore per connector installation and the
 * total count of open DataQualityIssues for the requesting organisation.
 *
 * Auth: any authenticated member of the organisation (no admin gate).
 *
 * All queries include a mandatory organization_id equality filter for
 * tenant isolation (workspace rule §6).
 *
 * Response shape:
 * {
 *   scores: DataQualityScore[],
 *   issueCount: number
 * }
 *
 * Requirements: 18.1, 18.3, 18.8
 */

import {
  requireAuth,
  getAdminClient,
  json,
  options,
  type Env,
} from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

// ─── Response types ───────────────────────────────────────────────────────────

interface DataQualityScoreRow {
  id:                 string;
  organization_id:    string;
  source_system_id:   string;
  entity_type:        string;
  completeness_score: number;
  accuracy_score:     number;
  consistency_score:  number;
  /** NULL = never measured (no health metric published), not a zero score. */
  timeliness_score:   number | null;
  validity_score:     number;
  overall_score:      number;
  quality_rating:     string;
  records_assessed:   number;
  records_with_issues: number;
  trend_direction:    string;
  trend_days:         number;
  scored_at:          string;
  created_at:         string;
  updated_at:         string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  // Authenticate: any org member may view quality summary.
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const { slug } = context.params as { slug: string };
  const supabase  = getAdminClient(context.env);

  // Resolve org from slug — MUST match the token's organizationId (tenant isolation).
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .eq('id', auth.organizationId)   // mandatory org_id equality filter
    .maybeSingle();

  if (orgErr || !org) {
    return json({ statusCode: 404, message: 'Organization not found' }, 404);
  }

  const orgId = org.id;

  // ── Fetch latest score per connector ─────────────────────────────────────
  // We want one row per (source_system_id, entity_type) — already enforced by
  // the unique index.  Simply return all scores for the org; the UI groups by
  // source_system_id.
  const { data: scores, error: scoresErr } = await supabase
    .from('data_quality_scores')
    .select('*')
    .eq('organization_id', orgId)
    .order('scored_at', { ascending: false });

  if (scoresErr) {
    console.error('[data-quality/summary] scores query failed:', scoresErr.message);
    return json({ statusCode: 502, message: 'Failed to fetch quality scores' }, 502);
  }

  // ── Count open issues ─────────────────────────────────────────────────────
  const { count: issueCount, error: issueErr } = await supabase
    .from('data_quality_issues')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .neq('status', 'remediated');

  if (issueErr) {
    console.error('[data-quality/summary] issue count query failed:', issueErr.message);
    return json({ statusCode: 502, message: 'Failed to fetch issue count' }, 502);
  }

  return json({
    scores:     (scores ?? []) as DataQualityScoreRow[],
    issueCount: issueCount ?? 0,
  });
};
