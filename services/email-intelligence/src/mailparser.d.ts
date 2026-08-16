declare module 'mailparser' {
  export function simpleParser(
    source: any,
    callback: (err: any, parsed: any) => void,
  ): void;

  export interface ParsedMail {
    headers: Map<string, any>;
    subject?: string;
    text?: string;
    textAsHtml?: string;
    html?: string;
    from?: { name?: string; address?: string };
    to?: Array<{ name?: string; address?: string }>;
    cc?: Array<{ name?: string; address?: string }>;
    bcc?: Array<{ name?: string; address?: string }>;
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
    attachments?: any[];
  }
}
