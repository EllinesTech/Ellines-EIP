/**
 * Capability-registry persistence for the Pages Functions plane.
 *
 * The registry is the honest inventory of what ONE connected system actually
 * exposes. Two rules govern everything here:
 *
 *  1. Discovery is built from the FULL published document, not from the subset
 *     EIP chose to read. A source that publishes 40 resources must show 40,
 *     otherwise the capability view understates the customer's system.
 *  2. A resource only becomes AVAILABLE through applyRetrievalResult(). Nothing
 *     in this module can promote a resource without a real retrieval result.
 */

import {
  applyRetrievalResult,
  availableCapabilityCount,
  buildRegistryFromOpenApi,
  type CapabilityAvailability,
  type CapabilityRegistry,
} from '@ellines-eip/shared';
import { getAdminClient, type Env } from './auth';

export interface ResourceRetrievalOutcome {
  resource: string;
  ok: boolean;
  retrievedRecordCount: number;
  reportedRecordCount: number;
  complete: boolean;
  stopReason: string;
  error?: string;
}

/** Map a real retrieval outcome onto the honest availability state. */
function availabilityFor(o: ResourceRetrievalOutcome): CapabilityAvailability {
  if (!o.ok) return 'UNAVAILABLE';
  // A truncated read is PARTIAL, never AVAILABLE — the same rule the snapshot
  // and the health endpoint use, so the three can never disagree.
  return o.complete ? 'AVAILABLE' : 'PARTIAL';
}

/**
 * Fold real retrieval outcomes into a derived registry.
 *
 * This is the ONLY way a resource leaves NOT_YET_SUPPORTED. Outcomes naming a
 * resource discovery never found are ignored rather than inventing an entry.
 */
export function applyOutcomes(
  registry: CapabilityRegistry,
  outcomes: ResourceRetrievalOutcome[],
): CapabilityRegistry {
  const known = new Set(registry.resources.map((r) => r.id));
  let out = registry;
  for (const o of outcomes) {
    if (!known.has(o.resource)) continue;
    out = applyRetrievalResult(out, {
      resourceId: o.resource,
      availability: availabilityFor(o),
      reason: o.ok ? o.stopReason : o.error || o.stopReason,
      retrievedRecordCount: o.retrievedRecordCount,
      reportedRecordCount: o.reportedRecordCount,
      complete: o.complete,
    });
  }
  return out;
}

/**
 * Build the registry for one installation from a real OpenAPI document plus
 * the retrieval outcomes EIP actually observed.
 *
 * `forbidden` and `unsupported` are paths the source or EIP has proven it
 * cannot read — never guesses.
 */
export function buildInstallationRegistry(input: {
  systemName: string;
  /**
   * Discovered operations. Typed structurally rather than as the importer's
   * `EndpointDef` because the parser also returns the derived `capability` and
   * `selectable` fields the registry needs, and the importer's `method` union is
   * narrower than what a document may actually declare. Only the fields used
   * here are required.
   */
  endpoints: Array<{
    path: string;
    method: string;
    operationId?: string | null;
    summary?: string | null;
    capability?: string;
    tags?: string[];
  }>;
  parametersByPath?: Record<string, string[]>;
  outcomes: ResourceRetrievalOutcome[];
  forbidden?: string[];
  unsupported?: string[];
  now?: string;
}): CapabilityRegistry {
  let registry = buildRegistryFromOpenApi({
    systemName: input.systemName,
    endpoints: input.endpoints,
    parametersByPath: input.parametersByPath,
    forbidden: input.forbidden,
    unsupported: input.unsupported,
    now: input.now,
  });

  // Fold the real retrieval evidence in. Each outcome names a resource that
  // discovery must have found; outcomes for unknown resources are ignored
  // rather than inventing an entry.
  const known = new Set(registry.resources.map((r) => r.id));
  for (const o of input.outcomes) {
    if (!known.has(o.resource)) continue;
    registry = applyRetrievalResult(registry, {
      resourceId: o.resource,
      availability: availabilityFor(o),
      reason: o.ok ? o.stopReason : o.error || o.stopReason,
      retrievedRecordCount: o.retrievedRecordCount,
      reportedRecordCount: o.reportedRecordCount,
      complete: o.complete,
      retrievedAt: input.now,
    });
  }
  return registry;
}

/**
 * Persist the registry for one installation. One row per installation: a single
 * connection carries a single capability inventory, regardless of how many
 * domains it spans.
 */
export async function saveCapabilityRegistry(
  env: Env,
  args: { installationId: string; organizationId: string; registry: CapabilityRegistry },
): Promise<void> {
  const supabase = getAdminClient(env);
  const now = new Date().toISOString();
  const available = availableCapabilityCount(args.registry);
  const unavailable = args.registry.resources.length - available;

  const { error } = await supabase.from('connector_capability_registries').upsert(
    {
      id: crypto.randomUUID(),
      installation_id: args.installationId,
      organization_id: args.organizationId,
      is_current: true,
      available_count: available,
      unavailable_count: unavailable,
      registry: args.registry,
      discovered_at: now,
      created_at: now,
      updated_at: now,
    },
    { onConflict: 'installation_id' },
  );
  // A registry write failure must not be swallowed: the capability view would
  // silently show nothing and the user could read that as "no capabilities".
  if (error) {
    throw new Error(
      `capability registry write failed: ${error.message} (code: ${error.code})`,
    );
  }
}

