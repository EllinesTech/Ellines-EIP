// Email Intelligence Service - Main Export
export { EmailAccountConnector } from './email-account-connector';
export type { EmailAccount, EmailMessage, ConnectionCredentials } from './email-account-connector';

export { EmailSummarizer } from './email-summarizer';
export type { EmailSummary } from './email-summarizer';

export { EmailCategorizer } from './email-categorizer';
export type { EmailCategory, EmailCategorization } from './email-categorizer';

export { ActionableItemExtractor } from './actionable-item-extractor';
export type { ActionItemType, ActionItem, EntityReference } from './actionable-item-extractor';

export { ResponseGenerator } from './response-generator';
export type { DraftResponse, OrganizationContext } from './response-generator';

export { ThreadTracker } from './thread-tracker';
export type { EmailThread, ThreadMessage } from './thread-tracker';

export { KnowledgeGraphIntegration } from './knowledge-graph-integration';
export type { EntityNode, EntityRelationship, KnowledgeGraphUpdate } from './knowledge-graph-integration';

// Main Email Intelligence Service
export { EmailIntelligenceService } from './email-intelligence.service';
