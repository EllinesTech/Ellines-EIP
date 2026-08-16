import { Injectable, Logger } from '@nestjs/common';

export interface DraftResponse {
  responseId: string;
  emailId: string;
  recipientEmail: string;
  subject: string;
  draftBody: string;
  tone: 'formal' | 'casual' | 'neutral' | 'urgent';
  confidence: number; // 0-100
  suggestedActions: string[];
  generatedAt: Date;
}

export interface OrganizationContext {
  organizationName: string;
  industry: string;
  values: string[];
  communicationStyle: 'formal' | 'casual' | 'neutral';
  defaultSignature: string;
}

@Injectable()
export class ResponseGenerator {
  private readonly logger = new Logger(ResponseGenerator.name);

  private readonly toneTemplates = {
    formal: {
      greeting: (name: string) => `Dear ${name},`,
      closing: (sig: string) => `Sincerely,\n${sig}`,
      phrases: ['We appreciate', 'Thank you for', 'We would like to', 'Please find'],
    },
    casual: {
      greeting: (name: string) => `Hi ${name},`,
      closing: (sig: string) => `Best regards,\n${sig}`,
      phrases: ['Thanks for', 'Awesome', 'Great to hear', 'Check out'],
    },
    neutral: {
      greeting: (name: string) => `Hello ${name},`,
      closing: (sig: string) => `Best,\n${sig}`,
      phrases: ['Thank you', 'We appreciate', 'Please see', 'Let me know'],
    },
    urgent: {
      greeting: (name: string) => `Hi ${name},`,
      closing: (sig: string) => `Urgent - ${sig}`,
      phrases: ['Immediate attention', 'ASAP', 'Priority', 'Action required'],
    },
  };

  /**
   * Determine appropriate response tone based on email urgency and context
   */
  determineTone(
    originalText: string,
    urgencyScore: number,
    category: string,
  ): 'formal' | 'casual' | 'neutral' | 'urgent' {
    if (urgencyScore >= 75) return 'urgent';
    if (category === 'customer_inquiry') return 'formal';
    if (category === 'internal') return 'casual';
    return 'neutral';
  }

  /**
   * Extract recipient email and name from sender
   */
  private extractRecipient(fromEmail: string): { name: string; email: string } {
    // Extract name and email from "Name <email@domain>" format
    const match = fromEmail.match(/^([^<]*)<([^>]*)>$/) || fromEmail.match(/^([^\s]*@[^\s]*)$/);

    if (match && match[1] && match[2]) {
      return {
        name: match[1].trim(),
        email: match[2].trim(),
      };
    }

    if (match && match[1]) {
      // Only email provided
      const namePart = match[1].split('@')[0].replace(/[._-]/g, ' ');
      return {
        name: namePart.charAt(0).toUpperCase() + namePart.slice(1),
        email: match[1].trim(),
      };
    }

    return {
      name: 'there',
      email: fromEmail,
    };
  }

  /**
   * Generate appropriate response body based on email content and type
   */
  private generateResponseBody(
    originalText: string,
    subject: string,
    emailCategory: string,
    tone: 'formal' | 'casual' | 'neutral' | 'urgent',
    urgencyScore: number,
    organizationContext?: OrganizationContext,
  ): string {
    const template = this.toneTemplates[tone];
    let body = '';

    // Determine response type based on category
    if (emailCategory === 'customer_inquiry') {
      body = this.generateCustomerResponse(originalText, tone, organizationContext);
    } else if (emailCategory === 'vendor') {
      body = this.generateVendorResponse(originalText, tone, organizationContext);
    } else if (emailCategory === 'internal') {
      body = this.generateInternalResponse(originalText, tone, organizationContext);
    } else {
      body = this.generateGenericResponse(originalText, tone, organizationContext);
    }

    return body;
  }

  /**
   * Generate customer response
   */
  private generateCustomerResponse(
    originalText: string,
    tone: 'formal' | 'casual' | 'neutral' | 'urgent',
    context?: OrganizationContext,
  ): string {
    const template = this.toneTemplates[tone];
    const phrases = template.phrases;

    // Determine issue type from original text
    const hasIssue = /problem|issue|error|not working|broken/i.test(originalText);
    const hasQuestion = /\?/.test(originalText);
    const hasPraise = /great|excellent|perfect|wonderful/i.test(originalText);

    let response = '';

    if (hasIssue) {
      response =
        `${phrases[2]} your concern regarding the issue you experienced. Our team takes these matters seriously.\n\n` +
        `We would like to help resolve this for you as quickly as possible. Could you please provide:\n` +
        `- A detailed description of what you encountered\n` +
        `- When the issue occurred\n` +
        `- Any error messages displayed\n\n` +
        `${phrases[1]} reaching out to us, and we look forward to assisting you.`;
    } else if (hasQuestion) {
      response =
        `${phrases[1]} your inquiry. We're here to help!\n\n` +
        `Based on your question, we believe we can assist you effectively. Please allow us ` +
        `24-48 hours for a comprehensive response from our team.\n\n` +
        `In the meantime, you may find additional resources at our knowledge base.`;
    } else if (hasPraise) {
      response =
        `${phrases[1]} your kind feedback. We truly appreciate customers like you!\n\n` +
        `Your satisfaction is our top priority, and comments like yours motivate our entire team.`;
    } else {
      response =
        `${phrases[1]} you for reaching out. We have received your message and will ` +
        `review it shortly.\n\n` +
        `Our team will respond with the information you need within one business day.`;
    }

    return response;
  }

  /**
   * Generate vendor response
   */
  private generateVendorResponse(
    originalText: string,
    tone: 'formal' | 'casual' | 'neutral' | 'urgent',
    context?: OrganizationContext,
  ): string {
    const hasInvoice = /invoice|bill|payment|receipt/i.test(originalText);
    const hasOrder = /order|delivery|shipment|tracking/i.test(originalText);
    const hasQuote = /quote|proposal|estimate|pricing/i.test(originalText);

    let response = '';

    if (hasInvoice) {
      response =
        `Thank you for sending the invoice. We have received it and will process it according ` +
        `to our standard procedures.\n\n` +
        `Payment will be made within the agreed terms. Please reference the invoice number ` +
        `for any future correspondence.`;
    } else if (hasOrder) {
      response =
        `Thank you for the update on our order. We appreciate your diligent communication.\n\n` +
        `We look forward to receiving the shipment and will confirm receipt upon delivery. ` +
        `Please let us know if there are any changes to the expected timeline.`;
    } else if (hasQuote) {
      response =
        `Thank you for providing the quote. We appreciate your prompt attention to our request.\n\n` +
        `We will review the proposal internally and provide feedback within 3-5 business days. ` +
        `Should we have any questions in the interim, we will reach out.`;
    } else {
      response =
        `Thank you for your message. We have received your communication and will review it.`;
    }

    return response;
  }

  /**
   * Generate internal response
   */
  private generateInternalResponse(
    originalText: string,
    tone: 'formal' | 'casual' | 'neutral' | 'urgent',
    context?: OrganizationContext,
  ): string {
    const hasMeeting = /meeting|call|sync/i.test(originalText);
    const hasApproval = /approve|review|sign/i.test(originalText);
    const hasUpdate = /update|status|progress/i.test(originalText);

    let response = '';

    if (hasMeeting) {
      response =
        `Thanks for reaching out about the meeting. I'm interested in discussing this.\n\n` +
        `I have the following slots available this week: Tuesday 2-3 PM, Thursday 10-11 AM. ` +
        `Let me know what works best for you.`;
    } else if (hasApproval) {
      response =
        `Thanks for sending this over. I'll review and get back to you with my feedback by end of day tomorrow.`;
    } else if (hasUpdate) {
      response =
        `Thanks for the update. I appreciate you keeping the team in the loop. ` +
        `Great progress on this initiative!`;
    } else {
      response =
        `Thanks for reaching out. I'll look into this and get back to you shortly.`;
    }

    return response;
  }

  /**
   * Generate generic response when category is unclear
   */
  private generateGenericResponse(
    originalText: string,
    tone: 'formal' | 'casual' | 'neutral' | 'urgent',
    context?: OrganizationContext,
  ): string {
    return `Thank you for reaching out. We have received your message and will respond shortly with the information or assistance you need.`;
  }

  /**
   * Generate draft email response
   */
  generateDraftResponse(
    emailId: string,
    fromEmail: string,
    originalSubject: string,
    originalText: string,
    emailCategory: string,
    urgencyScore: number,
    organizationContext?: OrganizationContext,
  ): DraftResponse {
    const recipient = this.extractRecipient(fromEmail);
    const tone = this.determineTone(originalText, urgencyScore, emailCategory);
    const template = this.toneTemplates[tone];

    const greeting = template.greeting(recipient.name);
    const body = this.generateResponseBody(
      originalText,
      originalSubject,
      emailCategory,
      tone,
      urgencyScore,
      organizationContext,
    );
    const signature = organizationContext?.defaultSignature || 'Best regards,\nYour Company';
    const closing = template.closing(signature);

    const draftBody = `${greeting}\n\n${body}\n\n${closing}`;

    // Determine confidence - higher for recognized categories
    let confidence = 70;
    if (['customer_inquiry', 'internal', 'vendor'].includes(emailCategory)) {
      confidence = 85;
    }

    const suggestedActions = [
      'Review for accuracy',
      'Customize with specific details',
      'Add any relevant attachments',
    ];

    if (urgencyScore >= 75) {
      suggestedActions.push('Send immediately');
    } else {
      suggestedActions.push('Schedule for sending');
    }

    return {
      responseId: `response_${emailId}_${Date.now()}`,
      emailId,
      recipientEmail: recipient.email,
      subject: `Re: ${originalSubject}`,
      draftBody,
      tone,
      confidence,
      suggestedActions,
      generatedAt: new Date(),
    };
  }

  /**
   * Batch generate draft responses
   */
  generateMultipleDrafts(
    emails: Array<{
      id: string;
      fromEmail: string;
      subject: string;
      text: string;
      category: string;
      urgencyScore: number;
    }>,
    organizationContext?: OrganizationContext,
  ): DraftResponse[] {
    return emails.map((email) =>
      this.generateDraftResponse(
        email.id,
        email.fromEmail,
        email.subject,
        email.text,
        email.category,
        email.urgencyScore,
        organizationContext,
      ),
    );
  }

  /**
   * Customize draft response with additional context
   */
  customizeDraft(
    draft: DraftResponse,
    customText?: string,
    organizationContext?: OrganizationContext,
  ): DraftResponse {
    if (customText) {
      draft.draftBody = customText;
    }

    return draft;
  }
}
