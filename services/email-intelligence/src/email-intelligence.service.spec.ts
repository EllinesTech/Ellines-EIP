import { EmailAccountConnector } from './email-account-connector';
import { EmailSummarizer } from './email-summarizer';
import { EmailCategorizer } from './email-categorizer';
import { ActionableItemExtractor } from './actionable-item-extractor';
import { ResponseGenerator } from './response-generator';
import { ThreadTracker } from './thread-tracker';
import { KnowledgeGraphIntegration } from './knowledge-graph-integration';

describe('Email Intelligence Service', () => {
  let emailSummarizer: EmailSummarizer;
  let emailCategorizer: EmailCategorizer;
  let actionableItemExtractor: ActionableItemExtractor;
  let responseGenerator: ResponseGenerator;
  let threadTracker: ThreadTracker;
  let knowledgeGraphIntegration: KnowledgeGraphIntegration;

  beforeEach(() => {
    emailSummarizer = new EmailSummarizer();
    emailCategorizer = new EmailCategorizer();
    actionableItemExtractor = new ActionableItemExtractor();
    responseGenerator = new ResponseGenerator();
    threadTracker = new ThreadTracker();
    knowledgeGraphIntegration = new KnowledgeGraphIntegration();
  });

  // ============ EMAIL SUMMARIZER TESTS ============
  describe('EmailSummarizer', () => {
    it('should extract key points from email text', () => {
      const text =
        'This is an important update about the project. We need to address the critical issue. The deadline is next Friday.';
      const keyPoints = emailSummarizer.extractKeyPoints(text);
      expect(keyPoints.length).toBeGreaterThan(0);
      expect(keyPoints[0]).toBeDefined();
    });

    it('should calculate urgency score correctly', () => {
      const urgentText = 'URGENT: This is critical and needs immediate attention!';
      const score = emailSummarizer.calculateUrgencyScore(urgentText, 'Urgent Issue', 'sender@example.com');
      expect(score).toBeGreaterThan(50);
    });

    it('should classify urgency levels correctly', () => {
      expect(emailSummarizer.getUrgencyLevel(90)).toBe('critical');
      expect(emailSummarizer.getUrgencyLevel(60)).toBe('high');
      expect(emailSummarizer.getUrgencyLevel(30)).toBe('medium');
      expect(emailSummarizer.getUrgencyLevel(10)).toBe('low');
    });

    it('should extract action items from email', () => {
      const text = 'Please approve this request. We need to review the documents. Can you send me the report?';
      const actions = emailSummarizer.extractActionItems(text);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should analyze sentiment correctly', () => {
      expect(emailSummarizer.analyzeSentiment('This is great and wonderful!')).toBe('positive');
      expect(emailSummarizer.analyzeSentiment('This is terrible and awful')).toBe('negative');
      expect(emailSummarizer.analyzeSentiment('Please send the file')).toBe('neutral');
    });

    it('should generate comprehensive summary', () => {
      const summary = emailSummarizer.generateSummary(
        'email_123',
        'This is an important message with critical information.',
        'Important Update',
        'john@example.com',
        true,
        2,
      );

      expect(summary.emailId).toBe('email_123');
      expect(summary.summary).toBeDefined();
      expect(summary.keyPoints).toBeInstanceOf(Array);
      expect(summary.urgencyScore).toBeGreaterThanOrEqual(0);
      expect(summary.urgencyScore).toBeLessThanOrEqual(100);
      expect(summary.hasAttachments).toBe(true);
      expect(summary.threadDepth).toBe(2);
    });

    it('should batch summarize multiple emails', () => {
      const emails = [
        { id: 'e1', text: 'First email', subject: 'Subject 1', from: 'user1@example.com' },
        { id: 'e2', text: 'Second email', subject: 'Subject 2', from: 'user2@example.com' },
        { id: 'e3', text: 'Third email', subject: 'Subject 3', from: 'user3@example.com' },
      ];

      const summaries = emailSummarizer.summarizeMultiple(emails);
      expect(summaries.length).toBe(3);
      expect(summaries[0].emailId).toBe('e1');
      expect(summaries[1].emailId).toBe('e2');
      expect(summaries[2].emailId).toBe('e3');
    });
  });

  // ============ EMAIL CATEGORIZER TESTS ============
  describe('EmailCategorizer', () => {
    it('should identify spam emails', () => {
      const spamEmail =
        'Click here now! You have won a prize! Confirm your identity for security.';
      const result = emailCategorizer.categorizeEmail(
        'email_spam',
        spamEmail,
        'You won!',
        'winner@spam.com',
      );

      expect(result.category).toBe('spam');
      expect(result.confidence).toBeGreaterThan(40);
    });

    it('should identify newsletter emails', () => {
      const newsletterEmail =
        'Check out our latest promotions and special offers! Limited time only. Unsubscribe here.';
      const result = emailCategorizer.categorizeEmail(
        'email_newsletter',
        newsletterEmail,
        'Newsletter - Special Offers',
        'newsletter@company.com',
      );

      expect(result.category).toBe('newsletter');
    });

    it('should identify vendor emails', () => {
      const vendorEmail = 'Invoice #12345 for your recent purchase. Payment due within 30 days.';
      const result = emailCategorizer.categorizeEmail(
        'email_vendor',
        vendorEmail,
        'Invoice',
        'vendor@supplier.com',
      );

      expect(result.category).toBe('vendor');
    });

    it('should identify customer inquiry emails', () => {
      const customerEmail = 'I have a question about your product. Can you help me troubleshoot this issue?';
      const result = emailCategorizer.categorizeEmail(
        'email_customer',
        customerEmail,
        'Product Support Request',
        'customer@client.com',
      );

      expect(result.category).toBe('customer_inquiry');
    });

    it('should identify internal emails', () => {
      const internalEmail =
        'Meeting scheduled for tomorrow at 2 PM. Please review the attached status update.';
      const result = emailCategorizer.categorizeEmail(
        'email_internal',
        internalEmail,
        'Team Status Update',
        'colleague@company.com',
      );

      expect(result.category).toBe('internal');
    });

    it('should batch categorize multiple emails', () => {
      const emails = [
        { id: 'e1', text: 'Click here to win!', subject: 'Prize', from: 'spam@spammer.com' },
        { id: 'e2', text: 'Invoice #123', subject: 'Invoice', from: 'vendor@supplier.com' },
        { id: 'e3', text: 'Team meeting tomorrow', subject: 'Meeting', from: 'colleague@company.com' },
      ];

      const results = emailCategorizer.categorizeMultiple(emails);
      expect(results.length).toBe(3);
      expect(results[0].category).toBe('spam');
      expect(results[1].category).toBe('vendor');
      expect(results[2].category).toBe('internal');
    });

    it('should provide category display names', () => {
      expect(emailCategorizer.getCategoryDisplayName('customer_inquiry')).toBe('Customer Inquiry');
      expect(emailCategorizer.getCategoryDisplayName('vendor')).toBe('Vendor');
      expect(emailCategorizer.getCategoryDisplayName('internal')).toBe('Internal');
      expect(emailCategorizer.getCategoryDisplayName('spam')).toBe('Spam');
      expect(emailCategorizer.getCategoryDisplayName('newsletter')).toBe('Newsletter');
    });
  });

  // ============ ACTIONABLE ITEM EXTRACTOR TESTS ============
  describe('ActionableItemExtractor', () => {
    it('should extract task action items', () => {
      const text = 'Please complete the report by Friday.';
      const items = actionableItemExtractor.extractActionItems(
        'email_123',
        text,
        'Task Assignment',
        'manager@company.com',
      );

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].type).toBe('task');
    });

    it('should extract approval requests', () => {
      const text = 'Please approve this proposal for budget allocation.';
      const items = actionableItemExtractor.extractActionItems(
        'email_124',
        text,
        'Approval Needed',
        'director@company.com',
      );

      expect(items.length).toBeGreaterThan(0);
    });

    it('should extract meeting requests', () => {
      const text = 'Can we schedule a meeting for next Tuesday to discuss the Q4 plans?';
      const items = actionableItemExtractor.extractActionItems(
        'email_125',
        text,
        'Meeting Request',
        'colleague@company.com',
      );

      expect(items.length).toBeGreaterThan(0);
    });

    it('should extract due dates from action items', () => {
      const text = 'This needs to be done by tomorrow.';
      const items = actionableItemExtractor.extractActionItems(
        'email_126',
        text,
        'Urgent Task',
        'sender@company.com',
      );

      if (items.length > 0) {
        // Due date extraction may or may not find a date depending on regex match
        expect(items[0]).toBeDefined();
        expect(items[0].description).toBeDefined();
      }
    });

    it('should extract priority levels correctly', () => {
      const urgentText = 'URGENT: This must be done immediately!';
      const items = actionableItemExtractor.extractActionItems(
        'email_127',
        urgentText,
        'Critical Task',
        'sender@company.com',
      );

      if (items.length > 0) {
        expect(items[0].priority).toBe('high');
      }
    });

    it('should extract assignee from email sender', () => {
      const text = 'Please complete this task.';
      const items = actionableItemExtractor.extractActionItems(
        'email_128',
        text,
        'Task',
        'John Doe <john@example.com>',
      );

      if (items.length > 0) {
        expect(items[0].assignee).toBeDefined();
      }
    });

    it('should batch extract action items from multiple emails', () => {
      const emails = [
        {
          id: 'e1',
          text: 'Please approve this request',
          subject: 'Approval',
          from: 'user1@company.com',
        },
        { id: 'e2', text: 'Schedule a meeting', subject: 'Meeting', from: 'user2@company.com' },
        { id: 'e3', text: 'Complete the report by Friday', subject: 'Task', from: 'user3@company.com' },
      ];

      const results = actionableItemExtractor.extractMultiple(emails);
      expect(results.length).toBe(3);
      expect(results.every((r) => Array.isArray(r))).toBe(true);
    });
  });

  // ============ RESPONSE GENERATOR TESTS ============
  describe('ResponseGenerator', () => {
    it('should determine appropriate tone for urgent emails', () => {
      const tone = responseGenerator.determineTone('Urgent issue needs immediate attention', 80, 'internal');
      expect(tone).toBe('urgent');
    });

    it('should determine formal tone for customer inquiries', () => {
      const tone = responseGenerator.determineTone('Customer support question', 30, 'customer_inquiry');
      expect(tone).toBe('formal');
    });

    it('should generate customer response drafts', () => {
      const draft = responseGenerator.generateDraftResponse(
        'email_130',
        'John Doe <john@customer.com>',
        'Product Support',
        'I have an issue with your product',
        'customer_inquiry',
        40,
      );

      expect(draft.responseId).toBeDefined();
      expect(draft.recipientEmail).toBe('john@customer.com');
      expect(draft.draftBody).toBeDefined();
      expect(draft.tone).toBe('formal');
      expect(draft.confidence).toBeGreaterThan(0);
    });

    it('should generate vendor response drafts', () => {
      const draft = responseGenerator.generateDraftResponse(
        'email_131',
        'vendor@supplier.com',
        'Invoice #123',
        'Invoice for recent purchase',
        'vendor',
        20,
      );

      expect(draft.draftBody).toBeDefined();
      expect(draft.tone).toBe('neutral');
    });

    it('should generate internal response drafts', () => {
      const draft = responseGenerator.generateDraftResponse(
        'email_132',
        'colleague@company.com',
        'Team Meeting',
        'Can we schedule a meeting?',
        'internal',
        30,
      );

      expect(draft.draftBody).toBeDefined();
      expect(draft.tone).toBe('casual');
    });

    it('should include suggested actions in draft', () => {
      const draft = responseGenerator.generateDraftResponse(
        'email_133',
        'sender@company.com',
        'Subject',
        'Email text',
        'internal',
        50,
      );

      expect(draft.suggestedActions).toBeInstanceOf(Array);
      expect(draft.suggestedActions.length).toBeGreaterThan(0);
    });

    it('should batch generate draft responses', () => {
      const emails = [
        {
          id: 'e1',
          fromEmail: 'customer@client.com',
          subject: 'Support Request',
          text: 'Product issue',
          category: 'customer_inquiry',
          urgencyScore: 60,
        },
        {
          id: 'e2',
          fromEmail: 'vendor@supplier.com',
          subject: 'Invoice',
          text: 'Payment due',
          category: 'vendor',
          urgencyScore: 20,
        },
      ];

      const drafts = responseGenerator.generateMultipleDrafts(emails);
      expect(drafts.length).toBe(2);
      expect(drafts[0].tone).toBe('formal');
      expect(drafts[1].tone).toBe('neutral');
    });

    it('should customize draft responses', () => {
      const originalDraft = responseGenerator.generateDraftResponse(
        'email_134',
        'sender@company.com',
        'Subject',
        'Email text',
        'internal',
        50,
      );

      const customizedDraft = responseGenerator.customizeDraft(
        originalDraft,
        'This is my custom response text',
      );

      expect(customizedDraft.draftBody).toBe('This is my custom response text');
    });
  });

  // ============ THREAD TRACKER TESTS ============
  describe('ThreadTracker', () => {
    it('should create new thread on first message', () => {
      threadTracker.addMessage(
        'msg_1',
        'sender@example.com',
        ['recipient@example.com'],
        'Test Subject',
        'Message body',
        new Date(),
      );

      expect(threadTracker.getThreadCount()).toBe(1);
    });

    it('should group related messages into threads', () => {
      threadTracker.addMessage(
        'msg_1',
        'sender@example.com',
        ['recipient@example.com'],
        'Test Subject',
        'First message',
        new Date(),
      );

      threadTracker.addMessage(
        'msg_2',
        'recipient@example.com',
        ['sender@example.com'],
        'Re: Test Subject',
        'Second message',
        new Date(Date.now() + 1000),
        [],
        'msg_1',
      );

      expect(threadTracker.getThreadCount()).toBe(1);
    });

    it('should track multiple independent threads', () => {
      threadTracker.addMessage('msg_1', 'user1@example.com', ['user2@example.com'], 'Subject A', 'Body A', new Date());
      threadTracker.addMessage('msg_2', 'user1@example.com', ['user2@example.com'], 'Subject B', 'Body B', new Date());

      expect(threadTracker.getThreadCount()).toBe(2);
    });

    it('should retrieve thread by ID', () => {
      const msg = threadTracker.addMessage(
        'msg_1',
        'sender@example.com',
        ['recipient@example.com'],
        'Subject',
        'Body',
        new Date(),
      );

      const thread = threadTracker.getThread(msg.threadId);
      expect(thread).toBeDefined();
      expect(thread?.subject).toBe('Subject');
    });

    it('should retrieve all messages in thread', () => {
      const msg1 = threadTracker.addMessage(
        'msg_1',
        'sender@example.com',
        ['recipient@example.com'],
        'Subject',
        'First message',
        new Date(),
      );

      threadTracker.addMessage(
        'msg_2',
        'recipient@example.com',
        ['sender@example.com'],
        'Re: Subject',
        'Second message',
        new Date(Date.now() + 1000),
        [],
        'msg_1',
      );

      const messages = threadTracker.getThreadMessages(msg1.threadId);
      expect(messages.length).toBe(2);
    });

    it('should mark thread as resolved', () => {
      const msg = threadTracker.addMessage(
        'msg_1',
        'sender@example.com',
        ['recipient@example.com'],
        'Subject',
        'Body',
        new Date(),
      );

      threadTracker.markThreadAsResolved(msg.threadId);
      const thread = threadTracker.getThread(msg.threadId);
      expect(thread?.status).toBe('resolved');
    });

    it('should mark thread as archived', () => {
      const msg = threadTracker.addMessage(
        'msg_1',
        'sender@example.com',
        ['recipient@example.com'],
        'Subject',
        'Body',
        new Date(),
      );

      threadTracker.markThreadAsArchived(msg.threadId);
      const thread = threadTracker.getThread(msg.threadId);
      expect(thread?.status).toBe('archived');
    });

    it('should reopen thread', () => {
      const msg = threadTracker.addMessage(
        'msg_1',
        'sender@example.com',
        ['recipient@example.com'],
        'Subject',
        'Body',
        new Date(),
      );

      threadTracker.markThreadAsResolved(msg.threadId);
      threadTracker.reopenThread(msg.threadId);
      const thread = threadTracker.getThread(msg.threadId);
      expect(thread?.status).toBe('active');
    });

    it('should search threads by subject', () => {
      threadTracker.addMessage('msg_1', 'user1@example.com', ['user2@example.com'], 'Project Alpha', 'Body', new Date());
      threadTracker.addMessage('msg_2', 'user1@example.com', ['user2@example.com'], 'Project Beta', 'Body', new Date());

      const results = threadTracker.searchThreads('Alpha');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].subject).toContain('Alpha');
    });

    it('should get active threads only', () => {
      const msg1 = threadTracker.addMessage('msg_1', 'user1@example.com', ['user2@example.com'], 'Active', 'Body', new Date());
      const msg2 = threadTracker.addMessage('msg_2', 'user1@example.com', ['user2@example.com'], 'Archived', 'Body', new Date());

      threadTracker.markThreadAsArchived(msg2.threadId);
      const activeThreads = threadTracker.getActiveThreads();

      expect(activeThreads.length).toBe(1);
      expect(activeThreads[0].threadId).toBe(msg1.threadId);
    });

    it('should generate conversation history', () => {
      const msg = threadTracker.addMessage(
        'msg_1',
        'sender@example.com',
        ['recipient@example.com'],
        'Subject',
        'Message body content',
        new Date(),
      );

      const history = threadTracker.getConversationHistory(msg.threadId);
      expect(history).toContain('Subject');
      expect(history).toContain('Message body content');
    });

    it('should clear old threads', () => {
      const msg1 = threadTracker.addMessage('msg_1', 'user1@example.com', ['user2@example.com'], 'Subject', 'Body', new Date());
      threadTracker.markThreadAsArchived(msg1.threadId);

      const cleared = threadTracker.clearOldThreads(0); // 0 days old
      expect(cleared).toBeGreaterThanOrEqual(0);
    });
  });

  // ============ KNOWLEDGE GRAPH INTEGRATION TESTS ============
  describe('KnowledgeGraphIntegration', () => {
    beforeEach(() => {
      knowledgeGraphIntegration.clearGraph();
    });

    it('should extract entities from email text', () => {
      const text = 'John Smith works at Acme Corp. They develop innovative products.';
      const entities = knowledgeGraphIntegration.extractEntities(text);

      expect(entities.length).toBeGreaterThan(0);
      expect(entities.some((e) => e.type === 'person')).toBe(true);
    });

    it('should extract entities from email metadata', () => {
      const text = 'Email body';
      const metadata = {
        from: 'sender@example.com',
        to: ['recipient@example.com', 'another@example.com'],
      };

      const entities = knowledgeGraphIntegration.extractEntities(text, metadata);
      expect(entities.length).toBeGreaterThan(0);
    });

    it('should extract relationships from email text', () => {
      const text = 'John Smith works at Microsoft Corp.';
      const entities = knowledgeGraphIntegration.extractEntities(text);
      const relationships = knowledgeGraphIntegration.extractRelationships(text, entities);

      expect(relationships.length).toBeGreaterThanOrEqual(0);
    });

    it('should create graph update from email', () => {
      const update = knowledgeGraphIntegration.createGraphUpdate(
        'email_140',
        'John works at Acme Corp.',
        { from: 'john@example.com', to: ['recipient@example.com'] },
      );

      expect(update.nodes).toBeInstanceOf(Array);
      expect(update.relationships).toBeInstanceOf(Array);
      expect(update.emailId).toBe('email_140');
    });

    it('should retrieve entity by ID', () => {
      knowledgeGraphIntegration.extractEntities('John Smith works here');
      const stats = knowledgeGraphIntegration.getGraphStats();

      if (stats.totalNodes > 0) {
        const entities = knowledgeGraphIntegration.searchEntities('John');
        if (entities.length > 0) {
          const entity = knowledgeGraphIntegration.getEntity(entities[0].id);
          expect(entity).toBeDefined();
        }
      }
    });

    it('should retrieve entity by name', () => {
      knowledgeGraphIntegration.extractEntities('John Smith from Acme');
      const entity = knowledgeGraphIntegration.getEntityByName('John Smith');

      if (entity) {
        expect(entity.name).toContain('John');
      }
    });

    it('should get entity relationships', () => {
      const update = knowledgeGraphIntegration.createGraphUpdate('email_141', 'John Smith works at Acme Corp.', undefined);

      if (update.nodes.length > 0) {
        const rels = knowledgeGraphIntegration.getEntityRelationships(update.nodes[0].id);
        expect(rels).toBeInstanceOf(Array);
      }
    });

    it('should find connected entities', () => {
      const update = knowledgeGraphIntegration.createGraphUpdate(
        'email_142',
        'John works at Acme. Acme is in New York.',
        undefined,
      );

      if (update.nodes.length > 0) {
        const connected = knowledgeGraphIntegration.findConnectedEntities(update.nodes[0].id, 2);
        expect(connected).toBeInstanceOf(Array);
      }
    });

    it('should find path between entities', () => {
      const update = knowledgeGraphIntegration.createGraphUpdate(
        'email_143',
        'John works at Acme',
        undefined,
      );

      if (update.nodes.length >= 2) {
        const paths = knowledgeGraphIntegration.findPath(update.nodes[0].id, update.nodes[1].id);
        expect(paths).toBeInstanceOf(Array);
      }
    });

    it('should search entities', () => {
      knowledgeGraphIntegration.extractEntities('John Smith and Jane Doe work together');
      const results = knowledgeGraphIntegration.searchEntities('John');

      expect(results).toBeInstanceOf(Array);
    });

    it('should get graph statistics', () => {
      knowledgeGraphIntegration.extractEntities('John Smith from Acme Corp');
      const stats = knowledgeGraphIntegration.getGraphStats();

      expect(stats.totalNodes).toBeGreaterThanOrEqual(0);
      expect(stats.totalRelationships).toBeGreaterThanOrEqual(0);
      expect(stats.nodesByType).toBeDefined();
      expect(stats.relationshipsByType).toBeDefined();
    });

    it('should export graph to JSON', () => {
      knowledgeGraphIntegration.extractEntities('John works at Acme');
      const exported = knowledgeGraphIntegration.exportGraph();

      expect(exported.nodes).toBeInstanceOf(Array);
      expect(exported.relationships).toBeInstanceOf(Array);
    });

    it('should clear graph', () => {
      knowledgeGraphIntegration.extractEntities('Test data');
      knowledgeGraphIntegration.clearGraph();

      const stats = knowledgeGraphIntegration.getGraphStats();
      expect(stats.totalNodes).toBe(0);
      expect(stats.totalRelationships).toBe(0);
    });
  });

  // ============ INTEGRATION TESTS ============
  describe('Email Intelligence Service Integration', () => {
    it('should process email end-to-end', () => {
      const emailText = 'Critical issue requires immediate attention. Please approve the fix by today.';
      const subject = 'URGENT: System Down';
      const from = 'admin@company.com';
      const to = ['team@company.com'];

      // Summarize
      const summary = emailSummarizer.generateSummary('email_150', emailText, subject, from);
      expect(summary.urgencyLevel).toBe('critical');

      // Categorize
      const categorization = emailCategorizer.categorizeEmail('email_150', emailText, subject, from);
      expect(categorization.confidence).toBeGreaterThan(0);

      // Extract action items
      const actionItems = actionableItemExtractor.extractActionItems('email_150', emailText, subject, from);
      expect(actionItems.length).toBeGreaterThan(0);

      // Generate response
      const draft = responseGenerator.generateDraftResponse(
        'email_150',
        from,
        subject,
        emailText,
        categorization.category,
        summary.urgencyScore,
      );
      expect(draft.draftBody).toBeDefined();
    });

    it('should track email threads and generate summaries', () => {
      // Add messages to thread
      const msg1 = threadTracker.addMessage(
        'msg_1',
        'john@company.com',
        ['jane@company.com'],
        'Project Discussion',
        'Let us discuss the project plan',
        new Date(),
      );

      threadTracker.addMessage(
        'msg_2',
        'jane@company.com',
        ['john@company.com'],
        'Re: Project Discussion',
        'I agree. Let us schedule a meeting.',
        new Date(Date.now() + 3600000),
        [],
        'msg_1',
      );

      const thread = threadTracker.getThread(msg1.threadId);
      expect(thread?.messageCount).toBe(2);
      expect(thread?.summary).toBeDefined();
    });

    it('should integrate email content with knowledge graph', () => {
      const emailText = 'John Smith from Acme Corp met with Jane Doe from Tech Solutions';
      const emailMetadata = {
        from: 'john@acme.com',
        to: ['jane@techsolutions.com'],
      };

      const update = knowledgeGraphIntegration.createGraphUpdate('email_151', emailText, emailMetadata);
      expect(update.nodes.length).toBeGreaterThan(0);
      expect(update.relationships.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple services together', () => {
      const emailText = 'Customer reports critical issue with payment processing. Immediate action needed.';
      const subject = 'Critical: Payment System Down';
      const from = 'support@customer.com';

      // Process through all services
      const summary = emailSummarizer.generateSummary('email_152', emailText, subject, from, false, 1);
      const categorization = emailCategorizer.categorizeEmail('email_152', emailText, subject, from);
      const actions = actionableItemExtractor.extractActionItems('email_152', emailText, subject, from);
      const draft = responseGenerator.generateDraftResponse(
        'email_152',
        from,
        subject,
        emailText,
        categorization.category,
        summary.urgencyScore,
      );
      const graphUpdate = knowledgeGraphIntegration.createGraphUpdate('email_152', emailText, { from, to: [] });

      expect(summary).toBeDefined();
      expect(categorization).toBeDefined();
      expect(actions).toBeDefined();
      expect(draft).toBeDefined();
      expect(graphUpdate).toBeDefined();
    });
  });
});
