import { Injectable, Logger } from '@nestjs/common';

export type EmailCategory = 'customer_inquiry' | 'vendor' | 'internal' | 'spam' | 'newsletter';

export interface EmailCategorization {
  emailId: string;
  category: EmailCategory;
  confidence: number; // 0-100
  categoryReasons: string[];
  createdAt: Date;
}

@Injectable()
export class EmailCategorizer {
  private readonly logger = new Logger(EmailCategorizer.name);

  private readonly spamPatterns = {
    keywords: [
      'viagra',
      'cialis',
      'click here',
      'confirm identity',
      'verify account',
      'prize',
      'winner',
      'lottery',
      'nigerian prince',
      'phishing',
    ],
    domains: ['bit.ly', 'tinyurl.com', 'short.link'],
  };

  private readonly newsletterPatterns = {
    keywords: [
      'unsubscribe',
      'newsletter',
      'promotional',
      'offer',
      'deal',
      'discount',
      'limited time',
      'sale',
      'marketing',
      'announcement',
    ],
    footers: [/unsubscribe|manage preferences|marketing email/i],
  };

  private readonly vendorPatterns = {
    keywords: [
      'invoice',
      'payment',
      'delivery',
      'order',
      'purchase',
      'supplier',
      'quote',
      'shipping',
      'receipt',
      'bill',
    ],
    indicators: ['invoice #', 'po#', 'reference #', 'tracking #'],
  };

  private readonly customerPatterns = {
    keywords: [
      'support',
      'help',
      'issue',
      'problem',
      'question',
      'feedback',
      'complaint',
      'inquiry',
      'request',
      'review',
    ],
    indicators: ['customer', 'client', 'behalf', 'account'],
  };

  private readonly internalPatterns = {
    keywords: ['meeting', 'team', 'project', 'status', 'update', 'review', 'approval', 'request'],
    indicators: ['internal', 'confidential', 'department', 'colleague'],
  };

  /**
   * Check if email is spam
   */
  private isSpam(text: string, subject: string, from: string): number {
    let spamScore = 0;
    const combinedText = `${subject} ${text} ${from}`.toLowerCase();

    // Check for spam keywords
    for (const keyword of this.spamPatterns.keywords) {
      if (combinedText.includes(keyword)) {
        spamScore += 15;
      }
    }

    // Check for suspicious domains
    for (const domain of this.spamPatterns.domains) {
      if (from.includes(domain)) {
        spamScore += 20;
      }
    }

    // Check for phishing indicators
    if (/click here|confirm|verify|urgent action|suspended|account locked/i.test(combinedText)) {
      spamScore += 15;
    }

    // Check for excessive capitalization or special characters
    const specialChars = (combinedText.match(/[!]{2,}|[\$]{2,}|[?]{2,}/g) || []).length;
    if (specialChars > 3) {
      spamScore += 10;
    }

    return Math.min(100, spamScore);
  }

  /**
   * Check if email is a newsletter
   */
  private isNewsletter(text: string, subject: string): number {
    let newsletterScore = 0;
    const combinedText = `${subject} ${text}`.toLowerCase();

    // Check for newsletter keywords
    for (const keyword of this.newsletterPatterns.keywords) {
      if (combinedText.includes(keyword)) {
        newsletterScore += 10;
      }
    }

    // Check for unsubscribe pattern
    for (const pattern of this.newsletterPatterns.footers) {
      if (pattern.test(combinedText)) {
        newsletterScore += 20;
      }
    }

    return Math.min(100, newsletterScore);
  }

  /**
   * Check if email is from vendor
   */
  private isVendor(text: string, subject: string): number {
    let vendorScore = 0;
    const combinedText = `${subject} ${text}`.toLowerCase();

    // Check for vendor keywords
    for (const keyword of this.vendorPatterns.keywords) {
      if (combinedText.includes(keyword)) {
        vendorScore += 8;
      }
    }

    // Check for vendor indicators (invoice #, etc.)
    for (const indicator of this.vendorPatterns.indicators) {
      if (combinedText.includes(indicator)) {
        vendorScore += 15;
      }
    }

    return Math.min(100, vendorScore);
  }

  /**
   * Check if email is a customer inquiry
   */
  private isCustomerInquiry(text: string, subject: string): number {
    let customerScore = 0;
    const combinedText = `${subject} ${text}`.toLowerCase();

    // Check for customer keywords
    for (const keyword of this.customerPatterns.keywords) {
      if (combinedText.includes(keyword)) {
        customerScore += 10;
      }
    }

    // Check for customer indicators
    for (const indicator of this.customerPatterns.indicators) {
      if (combinedText.includes(indicator)) {
        customerScore += 12;
      }
    }

    return Math.min(100, customerScore);
  }

  /**
   * Check if email is internal
   */
  private isInternal(text: string, subject: string, from: string): number {
    let internalScore = 0;
    const combinedText = `${subject} ${text} ${from}`.toLowerCase();

    // Check for internal keywords
    for (const keyword of this.internalPatterns.keywords) {
      if (combinedText.includes(keyword)) {
        internalScore += 8;
      }
    }

    // Check for internal indicators
    for (const indicator of this.internalPatterns.indicators) {
      if (combinedText.includes(indicator)) {
        internalScore += 15;
      }
    }

    return Math.min(100, internalScore);
  }

  /**
   * Categorize email based on content analysis
   */
  categorizeEmail(emailId: string, text: string, subject: string, from: string): EmailCategorization {
    const spamScore = this.isSpam(text, subject, from);
    const newsletterScore = this.isNewsletter(text, subject);
    const vendorScore = this.isVendor(text, subject);
    const customerScore = this.isCustomerInquiry(text, subject);
    const internalScore = this.isInternal(text, subject, from);

    const scores = {
      spam: spamScore,
      newsletter: newsletterScore,
      vendor: vendorScore,
      customer_inquiry: customerScore,
      internal: internalScore,
    };

    // Determine primary category
    let category: EmailCategory = 'internal';
    let maxScore = internalScore;
    const categoryReasons: string[] = [];

    // Spam takes highest priority
    if (spamScore > 40) {
      category = 'spam';
      maxScore = spamScore;
      categoryReasons.push('Spam keywords detected');
    } else if (newsletterScore > maxScore) {
      category = 'newsletter';
      maxScore = newsletterScore;
      categoryReasons.push('Newsletter pattern detected');
    } else if (vendorScore > maxScore) {
      category = 'vendor';
      maxScore = vendorScore;
      categoryReasons.push('Vendor/transaction pattern detected');
    } else if (customerScore > maxScore) {
      category = 'customer_inquiry';
      maxScore = customerScore;
      categoryReasons.push('Customer inquiry pattern detected');
    } else {
      category = 'internal';
      categoryReasons.push('Internal communication pattern detected');
    }

    const confidence = Math.min(100, Math.max(0, maxScore));

    return {
      emailId,
      category,
      confidence,
      categoryReasons,
      createdAt: new Date(),
    };
  }

  /**
   * Batch categorize multiple emails
   */
  categorizeMultiple(
    emails: Array<{
      id: string;
      text: string;
      subject: string;
      from: string;
    }>,
  ): EmailCategorization[] {
    return emails.map((email) => this.categorizeEmail(email.id, email.text, email.subject, email.from));
  }

  /**
   * Get category display name
   */
  getCategoryDisplayName(category: EmailCategory): string {
    const names: Record<EmailCategory, string> = {
      customer_inquiry: 'Customer Inquiry',
      vendor: 'Vendor',
      internal: 'Internal',
      spam: 'Spam',
      newsletter: 'Newsletter',
    };
    return names[category];
  }
}
