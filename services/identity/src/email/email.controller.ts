import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailIntelligenceService, EmailMessage } from './email-intelligence.service';

/**
 * Minimal interface that extends the Express Request with the JWT payload
 * attached by JwtAuthGuard.  The organizationId always comes from the token
 * (never from a query/body parameter) to satisfy tenant isolation (§6).
 */
interface AuthRequest {
  user: {
    userId: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

interface ConnectAccountDto {
  type: 'gmail' | 'app_password';
  email: string;
  token?: string;
  password?: string;
}

interface ExtractActionsDto {
  email: EmailMessage;
}

/**
 * EmailController — EIP 2.0 Task 14.2
 *
 * Routes (all prefixed /api/v1/email by identity server prefix):
 *   POST /email/connect             — connect an email account
 *   GET  /email/summary             — summarise unread messages
 *   GET  /email/threads/:threadId   — track a thread
 *   POST /email/actions             — extract action items from an email
 *
 * Security:
 *   - All routes require a valid JWT (JwtAuthGuard).
 *   - organizationId is sourced exclusively from the JWT — never from the
 *     request body — to satisfy tenant isolation rule §6.
 *
 * Requirements: 26.4, 32.1–32.8
 */
@Controller('email')
@UseGuards(JwtAuthGuard)
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailIntelligenceService) {}

  /**
   * POST /api/v1/email/connect
   *
   * Connects an email account for the authenticated user's organisation.
   * Credentials are encrypted at rest before persisting (§5).
   *
   * Requirement 32.1
   */
  @Post('connect')
  async connect(@Body() body: ConnectAccountDto, @Req() req: AuthRequest) {
    const orgId = req.user.organizationId;

    try {
      const result = await this.emailService.connectAccount(
        {
          type: body.type,
          email: body.email,
          token: body.token,
          password: body.password,
        },
        orgId,
      );

      return { success: true, data: result };
    } catch (err) {
      this.logger.error('[email/connect] failed', err);
      return { success: false, error: 'Failed to connect email account' };
    }
  }

  /**
   * GET /api/v1/email/summary?accountId=
   *
   * Summarises unread messages for a connected email account.
   * accountId is validated against the caller's org to prevent cross-tenant reads.
   *
   * Requirement 32.2
   */
  @Get('summary')
  async summary(
    @Query('accountId') accountId: string,
    @Req() req: AuthRequest,
  ) {
    const orgId = req.user.organizationId;

    if (!accountId) {
      return { success: false, error: 'accountId query parameter is required' };
    }

    try {
      const data = await this.emailService.summarizeUnread(accountId, orgId);
      return { success: true, data };
    } catch (err) {
      this.logger.error(`[email/summary] accountId=${accountId}`, err);
      return { success: false, error: 'Failed to retrieve email summary' };
    }
  }

  /**
   * GET /api/v1/email/threads/:threadId
   *
   * Tracks a thread and extracts key points, decisions, and pending actions.
   *
   * Requirement 32.6
   */
  @Get('threads/:threadId')
  async thread(@Param('threadId') threadId: string, @Req() req: AuthRequest) {
    const orgId = req.user.organizationId;

    try {
      const data = await this.emailService.trackThread(threadId, orgId);
      return { success: true, data };
    } catch (err) {
      this.logger.error(`[email/threads/${threadId}] failed`, err);
      return { success: false, error: 'Failed to track thread' };
    }
  }

  /**
   * POST /api/v1/email/actions
   *
   * Extracts action items from a submitted email message.
   *
   * Requirement 32.4
   */
  @Post('actions')
  async actions(@Body() body: ExtractActionsDto, @Req() req: AuthRequest) {
    // orgId available from JWT; not needed for extraction but validates auth
    void req.user.organizationId;

    if (!body.email) {
      return { success: false, error: 'email body field is required' };
    }

    try {
      const data = this.emailService.extractActions(body.email);
      return { success: true, data };
    } catch (err) {
      this.logger.error('[email/actions] failed', err);
      return { success: false, error: 'Failed to extract actions' };
    }
  }
}
