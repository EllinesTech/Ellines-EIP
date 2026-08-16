import { Injectable, Logger } from '@nestjs/common';

export interface EmailSummary {
  emailId: string;
  originalText: string;
  summary: string;
  keyPoints: string[];
  urgencyScore: number; // 0-100
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  requiredActions: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  hasAttachments: boolean;
  threadDepth: number;
  createdAt: Date;
}

@Injectable()
export class EmailSummarizer {
  private readonly logger = new Logger(EmailSummarizer.name);

  private readonly urgencyKeywords = {
    critical: ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'critical issue', 'down', 'outage'],
    high: ['important', 'priority', 'needs attention', 'quickly', 'soon', 'deadline', 'expiring', 'hurry'],
    medium: ['please', 'should', 'require', 'needed', 'action', 'review', 'check', 'verify'],
    low: ['fyi', 'info', 'reference', 'update', 'note', 'reminder'],
  };

  private readonly actionKeywords = [
    'approve',
    'reject',
    'confirm',
    'cancel',
    'schedule',
    'complete',
    'review',
    'sign',
    'send',
    'submit',
    'delete',
    'update',
    'create',
    'close',
  ];

  /**
   * Extract key points from email text
   */
  extractKeyPoints(text: string): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const keyPoints: string[] = [];

    // Get sentences that are longer than average and contain important words
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;

    for (const sentence of sentences) {
      const cleaned = sentence.trim();
      if (cleaned.length > avgLength * 0.7 && cleaned.length < 300) {
        // Filter for important content
        if (
          /\b(should|must|need|require|important|critical|issue|problem|solution|action)\b/i.test(
            cleaned,
          )
        ) {
          keyPoints.push(cleaned.substring(0, 150));
        }
      }
    }

    return keyPoints.slice(0, 5);
  }

  /**
   * Calculate urgency score based on keywords and indicators
   */
  calculateUrgencyScore(text: string, subject: string, from: string): number {
    let score = 0;
    const combinedText = `${subject} ${text}`.toLowerCase();

    // Check for critical keywords
    for (const keyword of this.urgencyKeywords.critical) {
      if (combinedText.includes(keyword)) {
        score += 30;
      }
    }

    // Check for high priority keywords
    for (const keyword of this.urgencyKeywords.high) {
      if (combinedText.includes(keyword)) {
        score += 15;
      }
    }

    // Check for medium priority keywords
    for (const keyword of this.urgencyKeywords.medium) {
      if (combinedText.includes(keyword)) {
        score += 5;
      }
    }

    // Check for deadline or time mentions
    if (/deadline|by|until|before|due|expires?/i.test(combinedText)) {
      score += 10;
    }

    // Check for multiple recipients (indicates broadcast)
    if (combinedText.match(/cc:|to:/gi)?.length ?? 0 > 3) {
      score -= 10;
    }

    // Cap score at 100
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Determine urgency level from score
   */
  getUrgencyLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  /**
   * Extract action items from email text
   */
  extractActionItems(text: string): string[] {
    const actions: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

    for (const sentence of sentences) {
      const cleaned = sentence.trim();

      // Look for sentences that start with or contain action verbs
      for (const actionVerb of this.actionKeywords) {
        const regex = new RegExp(`\\b${actionVerb}\\b`, 'i');
        if (regex.test(cleaned)) {
          actions.push(cleaned.substring(0, 200));
          break;
        }
      }
    }

    return actions.slice(0, 5);
  }

  /**
   * Analyze email sentiment
   */
  analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['good', 'great', 'excellent', 'perfect', 'wonderful', 'happy', 'thank'];
    const negativeWords = ['bad', 'terrible', 'awful', 'disappointed', 'angry', 'problem', 'error', 'fail'];

    const lowerText = text.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      positiveCount += (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
    }

    for (const word of negativeWords) {
      negativeCount += (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
    }

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Generate email summary
   */
  generateSummary(
    emailId: string,
    text: string,
    subject: string,
    from: string,
    hasAttachments: boolean = false,
    threadDepth: number = 1,
  ): EmailSummary {
    const urgencyScore = this.calculateUrgencyScore(text, subject, from);
    const keyPoints = this.extractKeyPoints(text);
    const requiredActions = this.extractActionItems(text);
    const sentiment = this.analyzeSentiment(text);

    // Create a basic summary by combining key information
    let summary = `From: ${from.split('<')[0].trim()}\n`;
    summary += `Subject: ${subject}\n\n`;

    if (keyPoints.length > 0) {
      summary += `Key Points:\n`;
      keyPoints.forEach((point, i) => {
        summary += `- ${point.trim()}\n`;
      });
    }

    if (requiredActions.length > 0) {
      summary += `\nRequired Actions:\n`;
      requiredActions.forEach((action, i) => {
        summary += `- ${action.trim()}\n`;
      });
    }

    return {
      emailId,
      originalText: text.substring(0, 500),
      summary,
      keyPoints,
      urgencyScore,
      urgencyLevel: this.getUrgencyLevel(urgencyScore),
      requiredActions,
      sentiment,
      hasAttachments,
      threadDepth,
      createdAt: new Date(),
    };
  }

  /**
   * Batch summarize multiple emails
   */
  summarizeMultiple(
    emails: Array<{
      id: string;
      text: string;
      subject: string;
      from: string;
      hasAttachments?: boolean;
      threadDepth?: number;
    }>,
  ): EmailSummary[] {
    return emails.map((email) =>
      this.generateSummary(
        email.id,
        email.text,
        email.subject,
        email.from,
        email.hasAttachments || false,
        email.threadDepth || 1,
      ),
    );
  }
}
