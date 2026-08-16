/**
 * Email Intelligence Service - Main Entry Point
 * 
 * This service provides comprehensive email intelligence capabilities including:
 * - Email account connection (Gmail, Outlook, Exchange)
 * - Email summarization with urgency detection
 * - Email categorization (customer, vendor, internal, spam, newsletter)
 * - Actionable item extraction
 * - Draft response generation
 * - Email thread tracking
 * - Knowledge graph integration
 */

import { EmailIntelligenceService } from './email-intelligence.service';

// Export all classes and types
export * from './email-account-connector';
export * from './email-summarizer';
export * from './email-categorizer';
export * from './actionable-item-extractor';
export * from './response-generator';
export * from './thread-tracker';
export * from './knowledge-graph-integration';
export * from './email-intelligence.service';

// Create and export service instance
export const emailIntelligenceService = new EmailIntelligenceService();

// Health check endpoint
export async function healthCheck() {
  return emailIntelligenceService.health();
}

console.log('Email Intelligence Service initialized');
