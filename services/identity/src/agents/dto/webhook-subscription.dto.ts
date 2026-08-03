export class CreateWebhookSubscriptionDto {
  eventSource: string; // "connector" | "webhook" | "system" | "manual"
  eventSourceId?: string; // Connector ID or webhook ID
  eventType: string; // Event type (e.g., "sync_complete", "sync_failed")
  filter?: Record<string, unknown>; // Optional filter rules
}

export class UpdateWebhookSubscriptionDto {
  isActive?: boolean;
  filter?: Record<string, unknown>;
}
