export class UpdateAgentDto {
  name?: string;
  description?: string;
  triggerConfig?: Record<string, unknown>;
  condition?: Record<string, unknown>;
  action?: Record<string, unknown>;
  confidenceThreshold?: number;
  requireApproval?: boolean;
  isActive?: boolean;
  isPaused?: boolean;
}
