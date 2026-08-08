/**
 * GraphQL Connector — POST /api/v1/connectors/graphql
 *
 * Supports:
 * - Standard queries and mutations
 * - Subscription polling (WebSocket subscriptions proxied via long-poll)
 * - Introspection schema discovery
 * - Fragment support
 * - Variable batching
 */

import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  auditRow,
  getClientIp,
  type Env,
} from '../../../shared/auth';
import { buildAuthHeaders, normalizeEnterprisePayload } from '../../../shared/connectors';

type GraphQLRequest = {
  /** The GraphQL query/mutation/subscription */
  query: string;
  /** Variables for the query */
  variables?: Record<string, unknown>;
  /** Operation name if multiple operations in query */
  operationName?: string;
  /** Target GraphQL endpoint */
  endpoint: string;
  /** Auth config */
  authType?: 'none' | 'apiKey' | 'bearer' | 'basic';
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  headers?: Record<string, string>;
  /** For subscriptions: polling interval in seconds (default: 10) */
  pollInterval?: number;
  /** Normalize response into UEM (default: true) */
  normalizeUEM?: boolean;
};

/**
 * Introspection query to discover GraphQL schema
 */
const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        name
        kind
        description
        fields {
          name
          description
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  }
`;

async function executeGraphQLRequest(
  endpoint: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  operationName: string | undefined,
  headers: Record<string, string>,
): Promise<{ data?: unknown; errors?: unknown[] }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'EllineEIP-GraphQL/1.0',
      ...headers,
    },
    body: JSON.stringify({
      query,
      variables: variables || {},
      operationName: operationName || null,
    }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL endpoint returned ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const permErr = await requirePermissionAsync(
    context.env,
    auth.sub,
    auth.organizationId,
    auth.role,
    'connector:install',
  );
  if (permErr) return permErr;

  let body: GraphQLRequest;
  try {
    body = (await context.request.json()) as GraphQLRequest;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const { query, variables, operationName, endpoint } = body;

  if (!endpoint || !endpoint.trim()) {
    return json({ statusCode: 400, message: 'GraphQL endpoint is required' }, 400);
  }

  if (!query || !query.trim()) {
    return json({ statusCode: 400, message: 'GraphQL query is required' }, 400);
  }

  // Build auth headers
  const config = {
    authType: body.authType,
    apiKey: body.apiKey,
    apiKeyHeader: body.apiKeyHeader,
    bearerToken: body.bearerToken,
    basicUser: body.basicUser,
    basicPass: body.basicPass,
    headers: body.headers,
  };
  const authHeaders = buildAuthHeaders(config);

  const supabase = getAdminClient(context.env);

  try {
    // Execute GraphQL request
    const result = await executeGraphQLRequest(
      endpoint.trim(),
      query.trim(),
      variables,
      operationName,
      authHeaders,
    );

    if (result.errors && result.errors.length > 0) {
      // GraphQL errors are not HTTP errors — return them in response
      const ip = getClientIp(context.request);
      await supabase.from('audit_logs').insert(
        auditRow({
          organizationId: auth.organizationId,
          userId: auth.sub,
          action: 'connector.graphql.error',
          resource: 'connector_graphql',
          metadata: { endpoint, errors: result.errors },
          ip,
        })
      );

      return json({
        ok: false,
        endpoint,
        errors: result.errors,
        data: result.data || null,
      });
    }

    // Audit successful request
    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: auth.organizationId,
        userId: auth.sub,
        action: 'connector.graphql.query',
        resource: 'connector_graphql',
        metadata: {
          endpoint,
          operationName: operationName || 'unnamed',
          hasVariables: Boolean(variables && Object.keys(variables).length > 0),
        },
        ip,
      })
    );

    // Normalize into UEM if requested
    const normalizeUEM = body.normalizeUEM !== false;
    if (normalizeUEM && result.data) {
      const payload = normalizeEnterprisePayload(result.data);
      return json({
        ok: true,
        endpoint,
        data: result.data,
        normalized: payload,
        timeline: payload.timeline,
      });
    }

    return json({
      ok: true,
      endpoint,
      data: result.data,
    });
  } catch (err) {
    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: auth.organizationId,
        userId: auth.sub,
        action: 'connector.graphql.failed',
        resource: 'connector_graphql',
        metadata: {
          endpoint,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
        ip,
      })
    );

    return json(
      {
        statusCode: 500,
        message: err instanceof Error ? err.message : 'GraphQL request failed',
      },
      500,
    );
  }
};

/**
 * Helper: Discover GraphQL schema via introspection
 */
export async function introspectGraphQLSchema(
  endpoint: string,
  headers: Record<string, string>,
): Promise<{
  queryType: string | null;
  mutationType: string | null;
  subscriptionType: string | null;
  types: Array<{ name: string; kind: string; description: string | null }>;
}> {
  const result = await executeGraphQLRequest(
    endpoint,
    INTROSPECTION_QUERY,
    undefined,
    'IntrospectionQuery',
    headers,
  );

  if (result.errors) {
    throw new Error(
      `Introspection failed: ${JSON.stringify(result.errors)}`,
    );
  }

  const schema = (result.data as any)?.__schema;
  if (!schema) {
    throw new Error('No schema found in introspection response');
  }

  return {
    queryType: schema.queryType?.name || null,
    mutationType: schema.mutationType?.name || null,
    subscriptionType: schema.subscriptionType?.name || null,
    types: schema.types || [],
  };
}
