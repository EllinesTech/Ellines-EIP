export class ProvideFeedbackDto {
  executionId: string;
  score: -1 | 0 | 1; // -1 = unhelpful, 0 = neutral, +1 = helpful
  comment?: string;
}
