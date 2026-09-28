/**
 * OrchestrateDto — request body for POST /ellinea/orchestrate.
 *
 * Carries the user query and org context so the orchestrator can classify,
 * route, and combine model results while logging the decision for audit.
 *
 * Requirement 1.2: route query to the most appropriate AI model / combination.
 * Requirement 1.8: log model selection decisions and reasoning for audit.
 */
export class OrchestrateDto {
  /** The user's free-text query. */
  query!: string;

  /** Organization ID for audit log association (Requirement 1.8). */
  orgId!: string;
}
