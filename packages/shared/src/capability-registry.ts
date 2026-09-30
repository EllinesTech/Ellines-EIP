/**
 * Universal resource & capability model (EIP: capability-driven, not
 * category-limited).
 *
 * THE CORE RULE
 * -------------
 * A connector is ONE connection to ONE system. That system may expose one
 * capability or a hundred. EIP must never assume a fixed module list — there is
 * no table anywhere saying "ERP = HR + Sales + Finance", because the next ERP
 * may be HR + Fleet + Manufacturing, and another may be Accounting only.
 *
 * The CONNECTED SYSTEM IS THE SOURCE OF TRUTH for its capabilities. This module
 * represents what a source actually exposed, and nothing else.
 *
 * What is deliberately NOT here:
 *   • a fixed list of business categories,
 *   • a mapping from connector type to modules,
 *   • any capability the source did not actually return.
 *
 * `domain` on a resource is a *display grouping hint* derived from the source's
 * own naming. It never gates retrieval and never invents a capability: the
 * resource identity (path + name + operations) is the authoritative part.
 */

import type { EndpointDef } from './openapi-importer';

/**
 * Honest availability states for a single capability. Collapsing these is how a
 * platform ends up showing a number it does not actually have.
 */
export type CapabilityAvailability =
  /** Source exposes it, we are authorized, and it was retrieved completely. */
  | 'AVAILABLE'
  /** The source does not expose this at all. */
  | 'NOT_PROVIDED_BY_SOURCE'
  /** Source has it, EIP does not know how to read it yet. */
  | 'NOT_YET_SUPPORTED'
  /** Source has it, but the credential in use is not permitted to read it. */
  | 'NOT_AUTHORIZED'
  /** Source has it, we tried, and the read failed. */
  | 'UNAVAILABLE'
  /** Source has it, but only part of it was retrieved. */
  | 'PARTIAL';

export const CAPABILITY_AVAILABILITY: readonly CapabilityAvailability[] = [
  'AVAILABLE',
  'NOT_PROVIDED_BY_SOURCE',
  'NOT_YET_SUPPORTED',
  'NOT_AUTHORIZED',
  'UNAVAILABLE',
  'PARTIAL',
] as const;

/** How a source paginates. `unknown` means the source did not say. */
export type PaginationStyle =
  | 'none' | 'page' | 'offset' | 'cursor' | 'token' | 'next-link' | 'unknown';

/** A relationship between two discovered resources. */
export interface ResourceRelationship {
  /** Resource the field lives on, e.g. `orders`. */
  from: string;
  /** The foreign-key-ish field, e.g. `customerId`. */
  field: string;
  /** Resource it points at, e.g. `customers`. */
  to: string;
  /**
   * `inferred` means EIP derived this from field/path naming. It is a navigable
   * hint, NOT a guarantee the source declares a relation.
   */
  origin: 'inferred';
}

/** One resource the source actually exposes. */
export interface DiscoveredResource {
  /** Stable identity: the path or GraphQL field the source published. */
  id: string;
  /** Human label derived from the source (e.g. "Employees"). */
  label: string;
  /** The source's own path, preserved verbatim. */
  path: string;
  /** HTTP methods the source offers for this resource. */
  operations: string[];
  /** Display grouping hint inferred from naming. Never authoritative. */
  domain?: string;
  /** Field names discovered from schemas/examples, when published. */
  fields?: string[];
  /** Pagination the source advertises. */
  pagination: PaginationStyle;
  /** Whether EIP can actually retrieve it end-to-end. */
  availability: CapabilityAvailability;
  /** Why it is not AVAILABLE. `undefined` when it is. */
  reason?: string;
  /** Last successful full retrieval. */
  lastRetrievedAt?: string;
  /** Records EIP actually retrieved. */
  retrievedRecordCount?: number;
  /** Total the source reported (0 = source published no total). */
  reportedRecordCount?: number;
  /** True only when retrieval provably reached the end. */
  complete?: boolean;
}

/** A whole connected system's capability inventory. */
export interface CapabilityRegistry {
  /** The source's own name, as published. */
  systemName: string;
  /** ISO timestamp of this discovery. */
  discoveredAt: string;
  /** How the capability inventory was obtained. */
  discoveryMethod: 'openapi' | 'graphql' | 'probe' | 'configured' | 'unknown';
  /** Every resource the source actually exposed. */
  resources: DiscoveredResource[];
  /** Relationships between those resources, if any could be inferred. */
  relationships: ResourceRelationship[];
  /**
   * Capabilities the business asked about that this source does NOT provide,
   * so the UI can say "not connected" honestly rather than omit them.
   */
  notProvided?: string[];
}


const PLURAL_SEGMENTS = new Set(['data', 'results', 'items', 'records', 'rows', 'content', 'entries']);

/** `GET /api/v1/employees` → `employees`. Collapses generic path segments. */
export function inferResourceId(path: string): string {
  const cleaned = path.split('?')[0].replace(/\/+$/, '');
  const segments = cleaned.split('/').filter(Boolean);
  const meaningful = segments.filter(
    (s) => !PLURAL_SEGMENTS.has(s.toLowerCase()) && !/^v\d+$/i.test(s) && !/^\{.*\}$/.test(s),
  );
  const last = meaningful[meaningful.length - 1] ?? cleaned.replace(/^\//, '') ?? 'root';
  return last.toLowerCase();
}

/** `employees` → `Employees`, `sales_orders` → `Sales Orders`. */
export function humanize(id: string): string {
  return id
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Singular of a resource id, used to match `customerId` → `customers`. */
export function singularize(id: string): string {
  if (id.endsWith('ies')) return `${id.slice(0, -3)}y`;
  if (id.endsWith('sses') || id.endsWith('shes') || id.endsWith('ches')) return id.slice(0, -2);
  if (id.endsWith('s') && !id.endsWith('ss')) return id.slice(0, -1);
  return id;
}

/**
 * Grouping hint. Prefers the source's OWN OpenAPI tag (its own module label),
 * then falls back to a leading path segment. Never a fixed category table.
 */
/** Path segments that are structure, not module names. */
const NON_MODULE_SEGMENTS = new Set(['api', 'rest', 'services', 'service', 'v1', 'v2', 'v3', 'public', 'internal']);

export function inferDomain(path: string, tags?: string[]): string | undefined {
  const firstTag = tags?.find((t) => typeof t === 'string' && t.trim());
  if (firstTag && firstTag.trim()) return humanize(firstTag.trim().toLowerCase());
  const segments = path
    .split('?')[0]
    .split('/')
    .filter((s) => s && !/^v\d+$/i.test(s) && !PLURAL_SEGMENTS.has(s.toLowerCase()));
  // Skip structural prefixes (/api/hr/... → "hr", not "api").
  const module = segments.find((s) => !NON_MODULE_SEGMENTS.has(s.toLowerCase()));
  // Only treat it as a module when there is something after it.
  if (module && segments.indexOf(module) < segments.length - 1) {
    return humanize(module.toLowerCase());
  }
  return undefined;
}

function inferPagination(parameters?: string[]): PaginationStyle {
  // Only infer what the source actually documented. When the parser captured
  // no parameters we report 'unknown' rather than guessing a pagination style.
  if (!parameters || parameters.length === 0) return 'unknown';
  const params = parameters.map((p) => String(p).toLowerCase());
  const has = (...names: string[]) => params.some((p) => names.some((n) => p.includes(n)));
  if (has('cursor', 'continuation', 'nexttoken', 'after')) return 'cursor';
  if (has('offset', 'skip')) return 'offset';
  if (has('page', 'pagenumber', 'page_number')) return 'page';
  if (has('limit', 'per_page', 'pagesize', 'page_size', 'take')) return 'offset';
  return 'unknown';
}


/**
 * The minimum a discovered operation must expose to become a capability.
 *
 * Deliberately narrower than the OpenAPI importer's `EndpointDef`: capability
 * discovery must work from ANY source of operation metadata (a hand-built
 * route list, a GraphQL introspection result, a future importer), not only from
 * a fully parsed OpenAPI document. Requiring `requiresAuth` and the content-type
 * fields here would make discovery impossible without a complete spec.
 */
export interface DiscoveredOperation {
  path: string;
  method?: string;
  operationId?: string | null;
  summary?: string | null;
  tags?: string[];
  /** Domain hint derived by the importer (e.g. "HR", "Fleet"). */
  capability?: string;
}

/**
 * Build a capability registry from what a source ACTUALLY published.
 *
 * Every entry here traces back to a real endpoint in the document. Nothing is
 * assumed from the product name: an API called "Acme ERP" that publishes only
 * /vehicles and /drivers yields exactly those two capabilities, whatever it is
 * called. A source that publishes no read operations yields no capabilities
 * rather than a fabricated module list.
 */
export function buildRegistryFromOpenApi(input: {
  systemName: string;
  endpoints: DiscoveredOperation[];
  /** Query parameter names per path, when the source documented them. */
  parametersByPath?: Record<string, string[]>;
  /** Paths the credential is not permitted to read (401/403 observed). */
  forbidden?: string[];
  /** Paths EIP has no reader for yet. */
  unsupported?: string[];
  now?: string;
}): CapabilityRegistry {
  const forbidden = new Set((input.forbidden ?? []).map((p) => p.toLowerCase()));
  const unsupported = new Set((input.unsupported ?? []).map((p) => p.toLowerCase()));

  // Group by resource so a resource offered by several operations is one entry.
  const byResource = new Map<string, DiscoveredResource>();

  for (const def of input.endpoints) {
    const path = def.path;
    const id = inferResourceId(path);
    const method = (def.method || 'GET').toUpperCase();
    const key = `${id}|${path}`;

    const existing = byResource.get(key);
    if (existing) {
      if (!existing.operations.includes(method)) existing.operations.push(method);
      continue;
    }

    let availability: CapabilityAvailability = 'AVAILABLE';
    let reason: string | undefined;

    if (forbidden.has(path.toLowerCase())) {
      availability = 'NOT_AUTHORIZED';
      reason = 'The credential in use is not permitted to read this resource.';
    } else if (unsupported.has(path.toLowerCase())) {
      availability = 'NOT_YET_SUPPORTED';
      reason = 'The source exposes this resource, but EIP has no reader for it yet.';
    } else if (method !== 'GET') {
      // A write-only endpoint is not a read capability; record it, but do not
      // claim EIP can retrieve it.
      availability = 'NOT_YET_SUPPORTED';
      reason = `Only ${method} is published; EIP capability is read-based.`;
    } else {
      // Discovered, but not yet retrieved. It is NOT "available" until a real
      // successful read proves it — claiming otherwise is exactly the kind of
      // fabricated capability this model exists to prevent.
      availability = 'NOT_YET_SUPPORTED';
      reason = 'Discovered from the API definition; not yet retrieved.';
    }

    byResource.set(key, {
      id,
      label: humanize(id),
      path,
      operations: [method],
      domain: inferDomain(path, def.tags),
      pagination: method === 'GET' ? inferPagination(input.parametersByPath?.[path]) : 'none',
      availability,
      reason,
    });
  }

  const resources = Array.from(byResource.values()).sort((a, b) => a.id.localeCompare(b.id));
  return {
    systemName: input.systemName,
    discoveredAt: input.now ?? new Date().toISOString(),
    discoveryMethod: 'openapi',
    resources,
    relationships: inferRelationships(resources),
  };
}

/**
 * Infer relationships between discovered resources from field naming.
 *
 * Marked `origin: 'inferred'` because the source may not declare them. EIP uses
 * these to navigate (Employee → Department), not to assert business truth.
 */
export function inferRelationships(resources: DiscoveredResource[]): ResourceRelationship[] {
  const ids = new Set(resources.map((r) => r.id));
  const out: ResourceRelationship[] = [];
  const seen = new Set<string>();

  for (const resource of resources) {
    for (const field of resource.fields ?? []) {
      // customerId, customer_id, customerID → customers
      const m = /^([A-Za-z]+?)(?:Id|ID|_id)$/.exec(field);
      if (!m) continue;
      const singular = m[1].toLowerCase();
      const candidates = [`${singular}s`, `${singular}es`, singular.endsWith('y') ? `${singular.slice(0, -1)}ies` : singular];
      const target = candidates.find((c) => ids.has(c) || ids.has(singularize(c)));
      if (!target || target === resource.id) continue;
      const key = `${resource.id}.${field}->${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: resource.id, field, to: target, origin: 'inferred' });
    }
  }
  return out;
}


/**
 * Record the outcome of a real retrieval against a discovered resource.
 *
 * This is the ONLY way a resource becomes AVAILABLE — discovery alone is not
 * proof. A resource that was reported as 10,000 but only yielded 500 becomes
 * PARTIAL, never "500 employees, healthy".
 */
export function applyRetrievalResult(
  registry: CapabilityRegistry,
  result: {
    resourceId: string;
    availability: CapabilityAvailability;
    reason?: string;
    retrievedRecordCount?: number;
    reportedRecordCount?: number;
    complete?: boolean;
    retrievedAt?: string;
  },
): CapabilityRegistry {
  return {
    ...registry,
    resources: registry.resources.map((r) =>
      r.id === result.resourceId
        ? {
            ...r,
            availability: result.availability,
            reason: result.reason,
            retrievedRecordCount: result.retrievedRecordCount,
            reportedRecordCount: result.reportedRecordCount,
            complete: result.complete,
            lastRetrievedAt: result.retrievedAt ?? new Date().toISOString(),
          }
        : r,
    ),
  };
}

/**
 * Group resources for display. Purely presentational: grouping never changes
 * what exists, and a resource with no domain simply groups under "Other".
 */
export function groupByDomain(registry: CapabilityRegistry): Record<string, DiscoveredResource[]> {
  const out: Record<string, DiscoveredResource[]> = {};
  for (const r of registry.resources) {
    const key = r.domain ?? 'Other';
    (out[key] ||= []).push(r);
  }
  return out;
}

/**
 * What can EIP actually show for this system right now?
 * Only counts resources whose retrieval genuinely succeeded.
 */
export function availableCapabilityCount(registry: CapabilityRegistry): number {
  return registry.resources.filter((r) => r.availability === 'AVAILABLE').length;
}

/** True when at least one resource was retrieved completely. */
export function hasAnyCompleteRetrieval(registry: CapabilityRegistry): boolean {
  return registry.resources.some((r) => r.availability === 'AVAILABLE' && r.complete !== false);
}



