import {
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import { parseOpenApiDocument, OpenApiParseError } from '@ellines-eip/shared';

/**
 * POST /api/v1/connectors/openapi/parse
 * Accepts a raw OpenAPI 2.0 / 3.0 / 3.1 document (JSON or YAML string).
 * Parses it and returns endpoints, auth type, and server base URL.
 * No network calls are made during parsing (Req 17.5).
 *
 * Requirements: 17.1–17.5, 23.1
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: { document?: unknown } = {};
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  if (!body.document) {
    return json({ statusCode: 422, message: 'document field is required (JSON or YAML string)' }, 422);
  }

  const docString = typeof body.document === 'string'
    ? body.document
    : JSON.stringify(body.document);

  try {
    const result = parseOpenApiDocument(docString);
    return json({ result });
  } catch (err) {
    if (err instanceof OpenApiParseError) {
      return json({
        statusCode: 422,
        message: err.message,
        location: err.location ?? null,
      }, 422);
    }
    return json({ statusCode: 422, message: err instanceof Error ? err.message : 'Invalid OpenAPI document' }, 422);
  }
};
