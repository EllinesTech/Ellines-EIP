export class CreateAgentDto {
  name!: string;
  description?: string;
  templateId?: string;
  trigger!: string;
  triggerConfig?: Record<string, unknown>;
  condition?: Record<string, unknown>;
  action!: Record<string, unknown>;
  confidenceThreshold?: number;
  requireApproval?: boolean;
}
