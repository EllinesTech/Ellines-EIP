export class UpdateAgentPolicyDto {
  /** Actions this agent is permitted to perform autonomously */
  allowedActions!: string[];

  /**
   * Confidence threshold for autonomous action (0 < value ≤ 1).
   * Actions below this threshold are deferred to human approval.
   */
  decisionThreshold!: number;

  /** Optional escalation rule to attach to this agent's policy */
  escalationRuleId?: string;
}
