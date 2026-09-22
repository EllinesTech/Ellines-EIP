/**
 * Canonical, unified permission grammar (spec §12.2) — ONE grammar + evaluator for
 * tenant AND platform permissions, shared by the Pages Functions evaluator
 * (`apps/web/functions/shared/auth.ts`) and the NestJS RBAC evaluator
 * (`services/identity/src/rbac/permission.service.ts`).
 *
 * Grammar: `<domain>[.<resource>...]:<action>`
 * - domain: one or more dot-separated segments (`connector`, `platform.tenants`, …)
 * - resource: optional further dot-separated segment(s) narrowing the target
 * - action: a verb (`read`, `create`, `manage`, …) or `*`
 * - `*` as the entire string matches every permission (reserved for Platform Owner)
 * - `*` is only valid as a WHOLE segment (rule 5: `platform.ten*` is invalid)
 * - action-less grants (`platform.tenants`, `platform.*`) are INVALID and match
 *   nothing — parsers reject them rather than prefix-matching (rule 4)
 * - no implicit prefix matching: `platform.tenants:read` never matches
 *   `platform.tenants.export:read` (rule 6) — that requires `platform.tenants.*:read`
 *
 * The existing single-segment tenant grammar (`connector:read`, `report:run`,
 * `connector:*`, bare `*`) is a strict subset — evaluation stays backward
 * compatible with every stored role permission (§12.2 migration note).
 *
 * Scope is NOT encoded here: resource-ID scoping (`entry.resources`) and ABAC
 * attributes remain properties of the grant record (§12.3) and are evaluated by
 * the callers after the string matches.
 */

/** First segment must be a named domain; later segments may be `*` (rule 3 resource wildcard). */
const PERMISSION_PATTERN =
  /^[a-z][a-z0-9_-]*(?:\.(?:[a-z][a-z0-9_-]*|\*))*(?::(?:[a-z][a-z0-9_-]*|\*))$/;

/**
 * Normalize a permission string (trim + lowercase) or return `null` when it is
 * not a valid §12.2 grant. `null` MUST fail closed: invalid grants match nothing.
 */
export function normalizePermission(permission: string): string | null {
  if (typeof permission !== 'string') return null;
  const value = permission.trim().toLowerCase();
  if (value === '*') return value;
  if (!PERMISSION_PATTERN.test(value)) return null;
  return value;
}

/** True when the string is a valid §12.2 permission grant. */
export function isValidPermission(permission: string): boolean {
  return normalizePermission(permission) !== null;
}

/**
 * Match a grant against a target permission under §12.2 semantics.
 * Invalid grants and invalid targets fail closed (return `false`).
 */
export function matchPermission(grant: string, target: string): boolean {
  const g = normalizePermission(grant);
  const t = normalizePermission(target);
  if (!g || !t) return false;
  if (g === '*') return true;

  const gColon = g.indexOf(':');
  const tColon = t.indexOf(':');
  const gDomain = g.slice(0, gColon);
  const gAction = g.slice(gColon + 1);
  const tDomain = t.slice(0, tColon);
  const tAction = t.slice(tColon + 1);

  // Rule 2: action wildcard (`platform.tenants:*`) or exact action.
  if (gAction !== '*' && gAction !== tAction) return false;

  return matchDomainSegments(gDomain.split('.'), tDomain.split('.'));
}

/** Segment-wise domain/resource match honouring rules 3 and 6 (no prefix matching). */
function matchDomainSegments(grant: string[], target: string[]): boolean {
  let gi = 0;
  let ti = 0;
  while (gi < grant.length) {
    if (ti >= target.length) return false;
    const segment = grant[gi];
    if (segment === '*') {
      if (gi === grant.length - 1) {
        // Trailing resource wildcard (rule 3): matches one-or-more remaining
        // segments — a resource wildcard requires an actual resource to match.
        return target.length - ti >= 1;
      }
      // Non-trailing wildcard consumes exactly one segment.
      gi += 1;
      ti += 1;
      continue;
    }
    if (segment !== target[ti]) return false;
    gi += 1;
    ti += 1;
  }
  // Rule 6: no implicit prefix/segment matching — every target segment consumed.
  return ti === target.length;
}
