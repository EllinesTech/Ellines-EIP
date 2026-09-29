/**
 * Ellines EIP — OpenAPI Document Importer
 *
 * Parses an OpenAPI 2.0 (Swagger) or OpenAPI 3.0.x / 3.1.x document
 * provided as a JSON or YAML string.
 *
 * No network calls are made during parsing.
 * No endpoints are executed — endpoint execution happens only at the
 * explicit test-connection step in the Connector Wizard.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.5
 */

import { parse as parseYaml } from 'yaml';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpenApiAuthType =
  | 'api_key'
  | 'bearer_token'
  | 'basic_auth'
  | 'oauth2_client_credentials'
  | 'oauth2_authorization_code'
  | 'oidc'
  | 'none'
  | 'unknown';

export interface EndpointDef {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  operationId: string | null;
  summary: string | null;
  tags: string[];
  /** Inferred request body content type, if any. */
  requestContentType: string | null;
  /** Inferred primary response content type, if any. */
  responseContentType: string | null;
  /** Whether this endpoint requires authentication per the document's security config. */
  requiresAuth: boolean;
}

export interface OpenApiParseResult {
  /** Detected OpenAPI version string (e.g. "3.0.3", "2.0"). */
  version: string;
  title: string;
  serverBaseUrl: string | null;
  authType: OpenApiAuthType;
  endpoints: EndpointDef[];
}

export class OpenApiParseError extends Error {
  constructor(
    message: string,
    public readonly location?: string,
  ) {
    super(message);
    this.name = 'OpenApiParseError';
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

type AnyObject = Record<string, unknown>;

function asObject(v: unknown): AnyObject | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as AnyObject;
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

const SUPPORTED_HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
type HttpMethod = typeof SUPPORTED_HTTP_METHODS[number];

// ─── Auth type mapping ────────────────────────────────────────────────────────

/**
 * Map OpenAPI security scheme definitions to an `OpenApiAuthType`.
 * Takes the first recognised scheme from the document.
 */
function detectAuthType(securitySchemes: AnyObject): OpenApiAuthType {
  for (const scheme of Object.values(securitySchemes)) {
    const s = asObject(scheme);
    if (!s) continue;
    const type = asString(s['type'])?.toLowerCase();
    const schemeVal = asString(s['scheme'])?.toLowerCase();
    const flow = asObject(s['flows'] ?? s['flow']);

    if (type === 'apikey' || type === 'api_key') return 'api_key';
    if (type === 'http' && schemeVal === 'bearer') return 'bearer_token';
    if (type === 'http' && schemeVal === 'basic') return 'basic_auth';
    if (type === 'oauth2') {
      // Prefer client_credentials if available
      if (flow && 'clientCredentials' in flow) return 'oauth2_client_credentials';
      if (flow && 'authorizationCode' in flow) return 'oauth2_authorization_code';
      // OpenAPI 2 flow
      const flowType = asString(s['flow']);
      if (flowType === 'application') return 'oauth2_client_credentials';
      if (flowType === 'accessCode') return 'oauth2_authorization_code';
      return 'oauth2_client_credentials'; // default OAuth2 fallback
    }
    if (type === 'openidconnect') return 'oidc';
    if (type === 'mutualTLS' || type === 'mutualtls') return 'unknown';
  }
  return 'none';
}

// ─── OpenAPI 3.x parser ───────────────────────────────────────────────────────

function parseV3(doc: AnyObject): OpenApiParseResult {
  const info = asObject(doc['info']) ?? {};
  const title = asString(info['title']) ?? 'Untitled API';
  const version = asString(doc['openapi']) ?? '3.0.0';

  // Server base URL — first server entry
  const servers = asArray(doc['servers']);
  let serverBaseUrl: string | null = null;
  const firstServer = asObject(servers[0]);
  if (firstServer) {
    serverBaseUrl = asString(firstServer['url']) ?? null;
  }

  // Auth type
  const components = asObject(doc['components']) ?? {};
  const securitySchemes = asObject(components['securitySchemes']) ?? {};
  const authType = detectAuthType(securitySchemes);

  // Global security requirement
  const globalSecurity = asArray(doc['security']);
  const hasGlobalSecurity = globalSecurity.length > 0;

  // Endpoints
  const paths = asObject(doc['paths']) ?? {};
  const endpoints: EndpointDef[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    const pi = asObject(pathItem);
    if (!pi) continue;

    for (const method of SUPPORTED_HTTP_METHODS) {
      const op = asObject(pi[method]);
      if (!op) continue;

      const operationId = asString(op['operationId']);
      const summary = asString(op['summary']) ?? asString(op['description']);
      const tags = asArray(op['tags']).filter((t): t is string => typeof t === 'string');

      // Request body content type
      let requestContentType: string | null = null;
      const requestBody = asObject(op['requestBody']);
      if (requestBody) {
        const content = asObject(requestBody['content']) ?? {};
        requestContentType = Object.keys(content)[0] ?? null;
      }

      // Response content type — first 2xx response
      let responseContentType: string | null = null;
      const responses = asObject(op['responses']) ?? {};
      for (const [code, resp] of Object.entries(responses)) {
        if (/^2\d\d$/.test(code)) {
          const rObj = asObject(resp);
          if (rObj) {
            const content = asObject(rObj['content']) ?? {};
            responseContentType = Object.keys(content)[0] ?? null;
          }
          break;
        }
      }

      // Endpoint-level security override
      const opSecurity = op['security'];
      let requiresAuth: boolean;
      if (Array.isArray(opSecurity)) {
        requiresAuth = opSecurity.length > 0;
      } else {
        requiresAuth = hasGlobalSecurity;
      }

      endpoints.push({
        path,
        method: method.toUpperCase() as EndpointDef['method'],
        operationId,
        summary,
        tags,
        requestContentType,
        responseContentType,
        requiresAuth,
      });
    }
  }

  return { version, title, serverBaseUrl, authType, endpoints };
}

// ─── OpenAPI 2.0 (Swagger) parser ────────────────────────────────────────────

function parseV2(doc: AnyObject): OpenApiParseResult {
  const info = asObject(doc['info']) ?? {};
  const title = asString(info['title']) ?? 'Untitled API';

  // Server base URL from host + basePath + schemes
  const host = asString(doc['host']);
  const basePath = asString(doc['basePath']) ?? '/';
  const schemes = asArray(doc['schemes']).filter((s): s is string => typeof s === 'string');
  let serverBaseUrl: string | null = null;
  if (host) {
    const scheme = schemes.includes('https') ? 'https' : schemes[0] ?? 'https';
    serverBaseUrl = `${scheme}://${host}${basePath === '/' ? '' : basePath}`;
  }

  // Auth type from securityDefinitions
  const securityDefinitions = asObject(doc['securityDefinitions']) ?? {};
  const authType = detectAuthType(securityDefinitions);

  // Global security
  const globalSecurity = asArray(doc['security']);
  const hasGlobalSecurity = globalSecurity.length > 0;

  // Endpoints
  const paths = asObject(doc['paths']) ?? {};
  const endpoints: EndpointDef[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    const pi = asObject(pathItem);
    if (!pi) continue;

    for (const method of SUPPORTED_HTTP_METHODS) {
      const op = asObject(pi[method]);
      if (!op) continue;

      const operationId = asString(op['operationId']);
      const summary = asString(op['summary']) ?? asString(op['description']);
      const tags = asArray(op['tags']).filter((t): t is string => typeof t === 'string');

      // Request content type from consumes
      const consumes = asArray(op['consumes']).concat(asArray(doc['consumes']));
      const requestContentType = consumes.find((c): c is string => typeof c === 'string') ?? null;

      // Response content type from produces
      const produces = asArray(op['produces']).concat(asArray(doc['produces']));
      const responseContentType = produces.find((p): p is string => typeof p === 'string') ?? null;

      // Security
      const opSecurity = op['security'];
      let requiresAuth: boolean;
      if (Array.isArray(opSecurity)) {
        requiresAuth = opSecurity.length > 0;
      } else {
        requiresAuth = hasGlobalSecurity;
      }

      endpoints.push({
        path,
        method: method.toUpperCase() as EndpointDef['method'],
        operationId,
        summary,
        tags,
        requestContentType,
        responseContentType,
        requiresAuth,
      });
    }
  }

  return { version: '2.0', title, serverBaseUrl, authType, endpoints };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse an OpenAPI 2.0 (Swagger) or OpenAPI 3.0.x / 3.1.x document.
 *
 * Accepts JSON or YAML string input.
 * No network calls are made — endpoint execution does not occur during parsing.
 *
 * @param input - Raw document string (JSON or YAML)
 * @returns Parsed `OpenApiParseResult`
 *
 * @throws {OpenApiParseError} if the document is malformed, unparseable, or
 *   an unsupported version. Never returns a partial result.
 */
export function parseOpenApiDocument(input: string): OpenApiParseResult {
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    throw new OpenApiParseError('Input document is empty or not a string');
  }

  // Parse JSON or YAML — try JSON first (faster), fall back to YAML
  let doc: unknown;
  try {
    doc = JSON.parse(input);
  } catch {
    try {
      doc = parseYaml(input);
    } catch (yamlErr) {
      const msg = yamlErr instanceof Error ? yamlErr.message : String(yamlErr);
      throw new OpenApiParseError(
        `Document could not be parsed as JSON or YAML: ${msg}`,
        'root',
      );
    }
  }

  const obj = asObject(doc);
  if (!obj) {
    throw new OpenApiParseError(
      'Document root must be a JSON/YAML object',
      'root',
    );
  }

  // Detect version
  const openapi = asString(obj['openapi']);
  const swagger = asString(obj['swagger']);

  if (openapi) {
    const major = parseInt(openapi.split('.')[0], 10);
    if (major === 3) {
      try {
        return parseV3(obj);
      } catch (err) {
        if (err instanceof OpenApiParseError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new OpenApiParseError(`Failed to parse OpenAPI 3.x document: ${msg}`, 'paths');
      }
    }
    throw new OpenApiParseError(
      `Unsupported OpenAPI version "${openapi}". Supported: 2.0, 3.0.x, 3.1.x`,
      'openapi',
    );
  }

  if (swagger) {
    const major = parseInt(swagger.split('.')[0], 10);
    if (major === 2) {
      try {
        return parseV2(obj);
      } catch (err) {
        if (err instanceof OpenApiParseError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new OpenApiParseError(`Failed to parse Swagger 2.0 document: ${msg}`, 'paths');
      }
    }
    throw new OpenApiParseError(
      `Unsupported Swagger version "${swagger}". Supported: 2.0`,
      'swagger',
    );
  }

  throw new OpenApiParseError(
    'Document is missing required "openapi" or "swagger" version field',
    'root',
  );
}
