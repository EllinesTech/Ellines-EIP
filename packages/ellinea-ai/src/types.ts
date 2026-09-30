/** Minimal enterprise snapshot shape Ellinea needs (decoupled from web DTO). */
/**
 * Human phrasing for a health score that may be unknown.
 *
 * `healthScore` is null when no connected system published a health metric.
 * Printing "Health 0/100" or "health dipped" for an unknown value would state
 * something EIP does not know, so unknown is always phrased as unknown.
 */
export function describeHealth(score: number | null | undefined): string {
  return typeof score === 'number' ? `${score}/100` : 'not reported by the connected system';
}

/** True only when a real health score exists AND it is below the threshold. */
export function healthBelow(score: number | null | undefined, threshold: number): boolean {
  return typeof score === 'number' && score < threshold;
}

/** True when health is unknown — callers should say so rather than assume. */
export function healthUnknown(score: number | null | undefined): boolean {
  return typeof score !== 'number';
}

/** Minimal enterprise snapshot shape Ellinea needs (decoupled from web DTO). */
export type EllineaEnterpriseSnapshot = {
  /**
   * null = no connected system published a health metric. Ellinea must treat this
   * as UNKNOWN and say so, rather than treating it as 0% or inventing a score.
   */
  healthScore: number | null;
  openAlerts: number;
  openDecisions: number;
  connectedSystems: number;
  briefHighlight: string;
  connectorName: string;
  connectorId: string;
  /** False when the last retrieval was incomplete — the data is partial. */
  retrievalComplete?: boolean;
  /** Records EIP actually retrieved, as opposed to what the source reported. */
  retrievedRecordCount?: number;
  reportedRecordCount?: number;
  syncStatus?: 'synced' | 'partial' | 'error' | 'idle' | 'unknown' | 'reported';
  syncError?: string | null;
  timeline: { title: string; detail: string }[];
  model?: {
    version?: string;
    sourceSystem?: string;
    capabilities?: string[];
    counts?: {
      branches: number;
      departments: number;
      people: number;
      documents: number;
      assets: number;
      tasks: number;
      notifications: number;
      events: number;
    };
    objects?: {
      id: string;
      kind: string;
      name: string;
      status?: string;
      branchId?: string;
    }[];
  } | null;
  syncedAt: string | null;
  status: 'idle' | 'synced' | 'error';
};
