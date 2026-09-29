/**
 * POST /api/v1/ellinea/feedback
 *
 * Accepts feedback on an Ellinea AI answer and persists it to ModelDecisionLog
 * via the identity service.  Used for continuous learning signal collection.
 *
 * Requirement 24.3: Continuous learning feedback loop.
 *
 * Body:
 *   {
 *     answerId: string;        // The query/decision ID to attach feedback to
 *     rating: 1 | -1;          // Thumbs up (+1) or thumbs down (-1)
 *     comment?: string;        // Optional free-text comment (max 500 chars)
 *   }
 *
 * Response:
 *   { ok: true; feedbackId: string }
 *
 * Security:
 *   - Requires valid JWT.
 *   - No credential or personal data in response.
 *   - Rating ∈ {1, -1} — anything else is rejected.
 */

import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: {
    answerId?: unknown;
    rating?: unknown;
    comment?: unknown;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const answerId = typeof body.answerId === 'string' ? body.answerId.trim() : '';
  if (!answerId) {
    return json({ statusCode: 400, message: 'answerId is required' }, 400);
  }

  const rating = body.rating;
  if (rating !== 1 && rating !== -1) {
    return json({ statusCode: 400, message: 'rating must be 1 or -1' }, 400);
  }

  const comment =
    typeof body.comment === 'string'
      ? body.comment.trim().slice(0, 500)
      : undefined;

  // Persist feedback to ModelDecisionLog via Supabase (identity DB).
  // We PATCH the existing decision log row identified by query_id = answerId.
  // If no matching row exists, we create a new feedback record in the audit log.
  const supabase = getAdminClient(context.env);

  // Attempt to update an existing decision log row
  const { error: updateError } = await supabase
    .from('model_decision_logs')
    .update({
      // Store rating in the confidence field delta and routing_reason for audit
      routing_reason: `[feedback] User rated: ${rating > 0 ? 'positive' : 'negative'}${comment ? ` — "${comment}"` : ''}`,
      updated_at: new Date().toISOString(),
    })
    .eq('query_id', answerId)
    .eq('organization_id', auth.organizationId);

  if (updateError) {
    // Log the error but don't surface it — feedback is non-blocking
    console.error(`[feedback] Failed to update ModelDecisionLog: ${updateError.message}`);
  }

  // Also write to audit log for immutable feedback record
  const feedbackId = crypto.randomUUID();
  await supabase
    .from('audit_logs')
    .insert({
      id: feedbackId,
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'ellinea.feedback',
      resource: `model_decision:${answerId}`,
      metadata: {
        answerId,
        rating,
        ...(comment ? { comment } : {}),
      },
    })
    .then(({ error }) => {
      if (error) {
        console.error(`[feedback] Audit log insert failed: ${error.message}`);
      }
    });

  return json({ ok: true, feedbackId });
};
