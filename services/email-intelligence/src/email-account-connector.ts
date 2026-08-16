import { Injectable, Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import * as Imap from 'imap';
import { simpleParser } from 'mailparser';

export interface EmailAccount {
  id: string;
  organizationId: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'exchange';
  connectionMethod: 'oauth' | 'app_password' | 'imap';
  accessToken?: string;
  refreshToken?: string;
  appPassword?: string;
  imapConfig?: {
    host: string;
    port: number;
    tls: boolean;
  };
  isConnected: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailMessage {
  id: string;
  accountId: string;
  messageId: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  headers: Record<string, string>;
  receivedAt: Date;
  createdAt: Date;
}

export interface ConnectionCredentials {
  email: string;
  provider: 'gmail' | 'outlook' | 'exchange';
  connectionMethod: 'oauth' | 'app_password' | 'imap';
  accessToken?: string;
  refreshToken?: string;
  appPassword?: string;
  imapConfig?: {
    host: string;
    port: number;
    tls: boolean;
  };
}

@Injectable()
export class EmailAccountConnector {
  private readonly logger = new Logger(EmailAccountConnector.name);
  private readonly gmailClient = google.gmail({ version: 'v1' });

  /**
   * Initialize OAuth2 client for Gmail
   */
  private initializeGmailOAuth(clientId: string, clientSecret: string, redirectUrl: string): OAuth2Client {
    return new OAuth2Client(clientId, clientSecret, redirectUrl);
  }

  /**
   * Get Gmail authorization URL for OAuth flow
   */
  getGmailAuthorizationUrl(clientId: string, clientSecret: string, redirectUrl: string): string {
    const oauth2Client = this.initializeGmailOAuth(clientId, clientSecret, redirectUrl);
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens (Gmail OAuth)
   */
  async exchangeGmailAuthCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUrl: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    try {
      const oauth2Client = this.initializeGmailOAuth(clientId, clientSecret, redirectUrl);
      const { tokens } = await oauth2Client.getToken(code);

      return {
        accessToken: tokens.access_token || '',
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
      };
    } catch (error) {
      this.logger.error(`Failed to exchange Gmail auth code: ${error}`);
      throw new Error('Failed to authenticate with Gmail');
    }
  }

  /**
   * Test Gmail connection with OAuth token
   */
  async testGmailConnection(accessToken: string): Promise<boolean> {
    try {
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });

      return !!profile.data.emailAddress;
    } catch (error) {
      this.logger.error(`Failed to test Gmail connection: ${error}`);
      return false;
    }
  }

  /**
   * Test Outlook/Exchange connection with app password
   */
  async testOutlookConnection(
    email: string,
    appPassword: string,
    host: string = 'imap-mail.outlook.com',
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const imap = new Imap({
        user: email,
        password: appPassword,
        host,
        port: 993,
        tls: true,
      });

      const timeout = setTimeout(() => {
        imap.destroy();
        resolve(false);
      }, 5000);

      imap.on('error', (err) => {
        this.logger.error(`Outlook connection error: ${err}`);
        clearTimeout(timeout);
        resolve(false);
      });

      imap.on('ready', () => {
        clearTimeout(timeout);
        imap.closeBox(() => {
          imap.end();
        });
        resolve(true);
      });

      try {
        imap.openBox('INBOX', false, () => {});
      } catch (error) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  /**
   * Connect to email account with IMAP (Outlook, Exchange, or Gmail App Password)
   */
  async connectViaImap(
    email: string,
    password: string,
    provider: 'outlook' | 'exchange' | 'gmail',
  ): Promise<Imap> {
    const imapConfigs: Record<string, { host: string; port: number }> = {
      outlook: { host: 'imap-mail.outlook.com', port: 993 },
      exchange: { host: 'outlook.office365.com', port: 993 },
      gmail: { host: 'imap.gmail.com', port: 993 },
    };

    const config = imapConfigs[provider];
    if (!config) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const imap = new Imap({
      user: email,
      password,
      host: config.host,
      port: config.port,
      tls: true,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        imap.destroy();
        reject(new Error('IMAP connection timeout'));
      }, 10000);

      imap.on('ready', () => {
        clearTimeout(timeout);
        resolve(imap);
      });

      imap.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      try {
        imap.openBox('INBOX', false, () => {});
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Refresh Gmail access token using refresh token
   */
  async refreshGmailAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const oauth2Client = new OAuth2Client(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const { credentials } = await oauth2Client.refreshAccessToken();

      return {
        accessToken: credentials.access_token || '',
        expiresIn: credentials.expiry_date ? Math.floor((credentials.expiry_date - Date.now()) / 1000) : 3600,
      };
    } catch (error) {
      this.logger.error(`Failed to refresh Gmail token: ${error}`);
      throw new Error('Failed to refresh Gmail access token');
    }
  }

  /**
   * Fetch emails from IMAP connection
   */
  async fetchEmailsViaImap(
    imap: Imap,
    limit: number = 100,
  ): Promise<EmailMessage[]> {
    const messages: EmailMessage[] = [];

    return new Promise((resolve, reject) => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) reject(err);

        const f = imap.seq.fetch('1:' + Math.min(limit, box.messages.total), { bodies: '' });

        f.on('message', (msg, seqno) => {
          simpleParser(msg, async (err, parsed) => {
            if (err) {
              this.logger.error(`Error parsing email: ${err}`);
              return;
            }

            messages.push({
              id: `${seqno}-${Date.now()}`,
              accountId: '',
              messageId: parsed.messageId || '',
              subject: parsed.subject || '',
              from: typeof parsed.from?.text === 'string' ? parsed.from.text : '',
              to: parsed.to?.map((addr: any) => addr.address) || [],
              cc: parsed.cc?.map((addr: any) => addr.address),
              text: parsed.text || '',
              html: parsed.html,
              headers: Object.fromEntries(parsed.headers),
              receivedAt: parsed.date || new Date(),
              createdAt: new Date(),
            } as any);
          });
        });

        f.on('error', reject);
        f.on('end', () => {
          imap.closeBox(false, () => {
            resolve(messages);
          });
        });
      });
    });
  }

  /**
   * Fetch emails from Gmail API
   */
  async fetchEmailsViaGmail(accessToken: string, limit: number = 100): Promise<EmailMessage[]> {
    try {
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      const listRes = await gmail.users.messages.list({
        userId: 'me',
        maxResults: limit,
        q: 'is:unread',
      });

      const messages: EmailMessage[] = [];

      if (listRes.data.messages) {
        for (const msg of listRes.data.messages) {
          const msgRes = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id || '',
            format: 'full',
          });

          const msgData = msgRes.data;
          const headers: Record<string, string> = {};

          msgData.payload?.headers?.forEach((header) => {
            if (header.name && header.value) {
              headers[header.name] = header.value;
            }
          });

          messages.push({
            id: msgData.id || '',
            accountId: '',
            messageId: msgData.id || '',
            subject: headers['Subject'] || '',
            from: headers['From'] || '',
            to: headers['To']?.split(',').map((e) => e.trim()) || [],
            cc: headers['Cc']?.split(',').map((e) => e.trim()),
            text: msgData.snippet || '',
            headers,
            receivedAt: new Date(parseInt(msgData.internalDate || '0')),
            createdAt: new Date(),
          } as any);
        }
      }

      return messages;
    } catch (error) {
      this.logger.error(`Failed to fetch emails from Gmail: ${error}`);
      throw error;
    }
  }
}
