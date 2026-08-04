export class ExecuteAgentDto {
  triggeredBy?: string;
  triggerPayload?: Record<string, unknown>;
  confidence?: number;
  reasoning?: Record<string, unknown>;
  recommendedAction?: string;
}

export class ApproveExecutionDto {
  decision!: 'approved' | 'rejected';
  note?: string;
}
