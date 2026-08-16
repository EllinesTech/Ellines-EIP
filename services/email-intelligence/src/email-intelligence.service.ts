import { Injectable, Logger } from '@nestjs/common';
import { EmailAccountConnector } from './email-account-connector';
import { EmailSummarizer, EmailSummary } from './email-summarizer';
import { EmailCategorizer, EmailCategorization } from './email-categorizer';
import { ActionableItemExtractor, ActionItem } from './actionable-item-extractor';
import { ResponseGenerator, DraftResponse, OrganizationContext } from './response-generator';
import { ThreadTracker, EmailThread, ThreadMessage } from './thread-tracker';
import { KnowledgeGraphIntegration, KnowledgeGraphUpdate } from './knowledge-graph-integration';

export interface ProcessedEmail {
  emailId: string;
  summary: EmailSummary;
  categorization: EmailCategorization;
  actionItems: ActionItem[];
  draftResponse: DraftResponse;
  threadId: string;
  graphUpdate: KnowledgeGraphUpdate;
  processedAt: Date;
}

export interface EmailIntelligenceConfig {
  organizationContext?: OrganizationContext;
  enableGraphIntegration?: boolean;
  enableThreadTracking?: boolean;
  enableResponseGeneration?: boolean;
}

@Injectable()
export class EmailIntelligenceService {
  private readonly logger = new Logger(EmailIntelligenceService.name);

  private emailConnector: EmailAccountConnector;
  private emailSummarizer: EmailSummarizer;
  private emailCategorizer: EmailCategorizer;
  private actionableItemExtractor: ActionableItemExtractor;
  private responseGenerator: ResponseGenerator;
  private threadTracker: ThreadTracker;
  private knowledgeGraphIntegration: KnowledgeGraphIntegration;
  private config: EmailIntelligenceConfig;

  constructor(config?: EmailIntelligenceConfig) {
    this.emailConnector = new EmailAccountConnector();
    this.emailSummarizer = new EmailSummarizer();
    this.emailCategorizer = new EmailCategorizer();
    this.actionableItemExtractor = new ActionableItemExtractor();
    this.responseGenerator = new ResponseGenerator();
    this.threadTracker = new ThreadTracker();
    this.knowledgeGraphIntegration = new KnowledgeGraphIntegration();

    this.config = {
      enableGraphIntegration: true,
      enableThreadTracking: true,
      enableResponseGeneration: true,
      ...config,
    };
  }

  /**
   * Process a single email through all intelligence components
   */
  processEmail(
    emailId: string,
    from: string,
    to: string[],
    subject: string,
    body: string,
    hasAttachments: boolean = false,
  ): ProcessedEmail {
    this.logger.debug(`Processing email: ${emailId}`);

    // Step 1: Summarize email
    const summary = this.emailSummarizer.generateSummary(
      emailId,
      body,
      subject,
      from,
      hasAttachments,
      1,
    );

    // Step 2: Categorize email
    const categorization = this.emailCategorizer.categorizeEmail(emailId, body, subject, from);

    // Step 3: Extract action items
    const actionItems = this.actionableItemExtractor.extractActionItems(emailId, body, subject, from);

    // Step 4: Generate draft response
    const draftResponse = this.responseGenerator.generateDraftResponse(
      emailId,
      from,
      subject,
      body,
      categorization.category,
      summary.urgencyScore,
      this.config.organizationContext,
    );

    // Step 5: Track in thread (if enabled)
    let threadId = '';
    if (this.config.enableThreadTracking) {
      const threadMessage = this.threadTracker.addMessage(
        emailId,
        from,
        to,
        subject,
        body,
        new Date(),
        [],
      );
      threadId = threadMessage.threadId;
    }

    // Step 6: Integrate with knowledge graph (if enabled)
    let graphUpdate: KnowledgeGraphUpdate = {
      nodes: [],
      relationships: [],
      emailId,
      timestamp: new Date(),
    };

    if (this.config.enableGraphIntegration) {
      graphUpdate = this.knowledgeGraphIntegration.createGraphUpdate(
        emailId,
        body,
        { from, to },
      );
    }

    return {
      emailId,
      summary,
      categorization,
      actionItems,
      draftResponse,
      threadId,
      graphUpdate,
      processedAt: new Date(),
    };
  }

  /**
   * Process multiple emails
   */
  processEmails(
    emails: Array<{
      id: string;
      from: string;
      to: string[];
      subject: string;
      body: string;
      hasAttachments?: boolean;
    }>,
  ): ProcessedEmail[] {
    return emails.map((email) =>
      this.processEmail(
        email.id,
        email.from,
        email.to,
        email.subject,
        email.body,
        email.hasAttachments,
      ),
    );
  }

  /**
   * Get thread information and conversation history
   */
  getThreadInfo(threadId: string): { thread: EmailThread | undefined; messages: ThreadMessage[] } {
    const thread = this.threadTracker.getThread(threadId);
    const messages = this.threadTracker.getThreadMessages(threadId);

    return { thread, messages };
  }

  /**
   * Get conversation history for a thread
   */
  getConversationHistory(threadId: string): string {
    return this.threadTracker.getConversationHistory(threadId);
  }

  /**
   * Search for email threads
   */
  searchThreads(query: string): EmailThread[] {
    return this.threadTracker.searchThreads(query);
  }

  /**
   * Mark thread as resolved
   */
  resolveThread(threadId: string): EmailThread | undefined {
    return this.threadTracker.markThreadAsResolved(threadId);
  }

  /**
   * Get knowledge graph statistics
   */
  getGraphStats() {
    return this.knowledgeGraphIntegration.getGraphStats();
  }

  /**
   * Export knowledge graph
   */
  exportGraph() {
    return this.knowledgeGraphIntegration.exportGraph();
  }

  /**
   * Search entities in knowledge graph
   */
  searchEntities(query: string) {
    return this.knowledgeGraphIntegration.searchEntities(query);
  }

  /**
   * Get summarizer service instance
   */
  getSummarizer(): EmailSummarizer {
    return this.emailSummarizer;
  }

  /**
   * Get categorizer service instance
   */
  getCategorizer(): EmailCategorizer {
    return this.emailCategorizer;
  }

  /**
   * Get action item extractor instance
   */
  getActionItemExtractor(): ActionableItemExtractor {
    return this.actionableItemExtractor;
  }

  /**
   * Get response generator instance
   */
  getResponseGenerator(): ResponseGenerator {
    return this.responseGenerator;
  }

  /**
   * Get thread tracker instance
   */
  getThreadTracker(): ThreadTracker {
    return this.threadTracker;
  }

  /**
   * Get knowledge graph instance
   */
  getKnowledgeGraph(): KnowledgeGraphIntegration {
    return this.knowledgeGraphIntegration;
  }

  /**
   * Get connector instance
   */
  getConnector(): EmailAccountConnector {
    return this.emailConnector;
  }

  /**
   * Get active threads count
   */
  getActiveThreadsCount(): number {
    return this.threadTracker.getActiveThreads().length;
  }

  /**
   * Get service statistics
   */
  getServiceStats() {
    return {
      threadsCount: this.threadTracker.getThreadCount(),
      activeThreadsCount: this.getActiveThreadsCount(),
      graphStats: this.getGraphStats(),
      timestamp: new Date(),
    };
  }

  /**
   * Health check
   */
  health(): { status: string; message: string } {
    return {
      status: 'ok',
      message: 'Email Intelligence Service is healthy',
    };
  }
}
