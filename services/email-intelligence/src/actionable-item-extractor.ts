import { Injectable, Logger } from '@nestjs/common';

export type ActionItemType = 'task' | 'approval' | 'meeting_request' | 'information_request';

export interface ActionItem {
  id: string;
  emailId: string;
  type: ActionItemType;
  description: string;
  dueDate?: Date;
  assignee?: string;
  priority: 'high' | 'medium' | 'low';
  relatedEntities: EntityReference[];
  extractedAt: Date;
}

export interface EntityReference {
  type: 'person' | 'company' | 'product' | 'project';
  name: string;
  confidence: number;
}

@Injectable()
export class ActionableItemExtractor {
  private readonly logger = new Logger(ActionableItemExtractor.name);

  private readonly actionPatterns = {
    task: [
      /(?:please|can you|could you|would you|need|require)\s+(\w+(?:\s+\w+){0,5})\s*(?:\?|$|by|before|until)/i,
      /(?:action item|todo|task):\s*(.+?)(?:\.|$)/i,
      /(?:need to|should|must)\s+(\w+(?:\s+\w+){0,5})\s*(?:\?|$|by|before)/i,
    ],
    approval: [
      /(?:please\s+)?(?:approve|reject|review|sign)\s+(?:the\s+)?(.+?)(?:\?|$|by|before)/i,
      /(?:for\s+)?(?:approval|sign-off|authorization)\s*(?:of\s+)?(.+?)(?:\.|$)/i,
      /need(?:s)?\s+(?:your\s+)?(?:approval|signature|sign-off)\s+(?:on|for)\s+(.+?)(?:\?|$)/i,
    ],
    meeting_request: [
      /(?:let'?s\s+)?(?:schedule|arrange|book|set\s+up|have)\s+(?:a\s+)?(?:meeting|call|sync)\s+(?:on|for)?\s*(.+?)(?:\?|$)/i,
      /meeting request:\s*(.+?)(?:\n|$)/i,
      /(?:want to|would like to)\s+(?:meet|discuss)\s+(?:about|regarding)\s+(.+?)(?:\?|$)/i,
    ],
    information_request: [
      /(?:can\s+you\s+)?(?:provide|send|share)\s+(?:the|me|us)?\s*(?:information|details|data|report)\s+(?:on|about|for)\s+(.+?)(?:\?|$)/i,
      /(?:need|require)\s+(?:information|details|data)\s+(?:on|about|for|regarding)\s+(.+?)(?:\?|$)/i,
      /(?:what\s+)?(?:is|are)\s+(.+?)(?:\?|$)/i,
    ],
  };

  private readonly dueDatePatterns = [
    /(?:by|before|until|deadline|due)\s+(?:on\s+)?(?:today|tomorrow|this\s+week|next\s+week|end\s+of\s+(?:week|month)|end\s+of\s+day|eod)(?:\?|$)/i,
    /(?:by|before|until)\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /(?:by|before|until)\s+((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2})/i,
  ];

  private readonly priorityKeywords = {
    high: ['urgent', 'asap', 'critical', 'immediately', 'high priority', 'emergency'],
    medium: ['important', 'soon', 'needed', 'required'],
    low: ['when you get a chance', 'at your convenience', 'fyi', 'reference'],
  };

  /**
   * Extract action items from email content
   */
  extractActionItems(emailId: string, text: string, subject: string, from: string): ActionItem[] {
    const actionItems: ActionItem[] = [];
    const combinedText = `${subject}\n${text}`;
    const processedItems = new Set<string>();

    // Extract different types of action items
    for (const [type, patterns] of Object.entries(this.actionPatterns)) {
      for (const pattern of patterns) {
        const matches = combinedText.matchAll(pattern);

        for (const match of matches) {
          const itemText = match[1] || match[0];
          const itemKey = `${type}:${itemText.substring(0, 50)}`;

          // Avoid duplicates
          if (processedItems.has(itemKey)) {
            continue;
          }
          processedItems.add(itemKey);

          const priority = this.extractPriority(combinedText);
          const dueDate = this.extractDueDate(combinedText);
          const assignee = this.extractAssignee(from);
          const entities = this.extractEntities(itemText);

          actionItems.push({
            id: `action_${emailId}_${actionItems.length}`,
            emailId,
            type: type as ActionItemType,
            description: itemText.trim().substring(0, 500),
            dueDate,
            assignee,
            priority,
            relatedEntities: entities,
            extractedAt: new Date(),
          });
        }
      }
    }

    return actionItems.slice(0, 10); // Limit to 10 action items per email
  }

  /**
   * Extract priority from email context
   */
  private extractPriority(text: string): 'high' | 'medium' | 'low' {
    const lowerText = text.toLowerCase();

    for (const keyword of this.priorityKeywords.high) {
      if (lowerText.includes(keyword)) {
        return 'high';
      }
    }

    for (const keyword of this.priorityKeywords.medium) {
      if (lowerText.includes(keyword)) {
        return 'medium';
      }
    }

    return 'low';
  }

  /**
   * Extract due date from email text
   */
  private extractDueDate(text: string): Date | undefined {
    for (const pattern of this.dueDatePatterns) {
      if (pattern.test(text)) {
        // Simple parsing logic - in production use a date parsing library
        const today = new Date();

        if (/today|asap/i.test(text)) {
          return today;
        }
        if (/tomorrow/i.test(text)) {
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return tomorrow;
        }
        if (/this\s+week/i.test(text)) {
          const endOfWeek = new Date(today);
          endOfWeek.setDate(endOfWeek.getDate() + (5 - endOfWeek.getDay()));
          return endOfWeek;
        }
        if (/next\s+week/i.test(text)) {
          const nextWeek = new Date(today);
          nextWeek.setDate(nextWeek.getDate() + (12 - nextWeek.getDay()));
          return nextWeek;
        }
        if (/end\s+of\s+(?:week|day)/i.test(text)) {
          const eow = new Date(today);
          eow.setDate(eow.getDate() + (5 - eow.getDay()));
          return eow;
        }
        if (/end\s+of\s+month/i.test(text)) {
          const eom = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          return eom;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract assignee from email sender
   */
  private extractAssignee(from: string): string | undefined {
    // Extract name from email address (e.g., "John Doe <john@example.com>" -> "John Doe")
    const match = from.match(/^([^<]+)</);
    if (match) {
      return match[1].trim();
    }
    return undefined;
  }

  /**
   * Extract entities mentioned in action item
   */
  private extractEntities(text: string): EntityReference[] {
    const entities: EntityReference[] = [];

    // Simple entity extraction - in production use NER (Named Entity Recognition)
    // Look for patterns like "John Smith", "ACME Corp", "Product X", "Project Alpha"

    // Person names (capitalized words)
    const personMatches = text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g);
    for (const match of personMatches) {
      const name = match[1];
      if (name.length > 2 && !['The', 'And', 'For', 'With'].includes(name)) {
        entities.push({
          type: 'person',
          name,
          confidence: 0.7,
        });
        if (entities.length >= 3) break;
      }
    }

    return entities;
  }

  /**
   * Batch extract action items from multiple emails
   */
  extractMultiple(
    emails: Array<{
      id: string;
      text: string;
      subject: string;
      from: string;
    }>,
  ): ActionItem[][] {
    return emails.map((email) =>
      this.extractActionItems(email.id, email.text, email.subject, email.from),
    );
  }
}
