/**
 * InboxController — Email Inbox Window API
 *
 * Routes (all under /api/v1/inbox, JWT-protected):
 *
 *   Account management (per-org, owner/admin only):
 *     POST   /inbox/accounts            — add email account
 *     GET    /inbox/accounts            — list accounts (no passwords returned)
 *     GET    /inbox/accounts/:id        — get single account
 *     PATCH  /inbox/accounts/:id        — update label / displayMode / password
 *     DELETE /inbox/accounts/:id        — remove account + messages
 *     POST   /inbox/accounts/:id/test   — test IMAP connection
 *     POST   /inbox/accounts/:id/sync   — trigger immediate sync for one account
 *     POST   /inbox/sync                — sync all due accounts for this org
 *
 *   Message queries (all org users):
 *     GET    /inbox/messages            — list messages (?accountId= &unreadOnly=true &limit= &offset=)
 *     GET    /inbox/messages/:id        — get message + mark as read
 *     POST   /inbox/messages/:id/read   — mark read
 *     GET    /inbox/messages/:id/summary — Ellinea summary (generates & caches if missing)
 *
 * Security:
 *   - organizationId sourced exclusively from JWT (§6 tenant isolation)
 *   - Passwords never returned in any response
 *   - Account management gated on owner/admin roles
 *
 * Requirement: Email Inbox Window
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InboxService, ConnectAccountDto, UpdateAccountDto } from './inbox.service';
import { InboxPollerService } from './inbox-poller.service';

interface AuthRequest {
  user: {
    userId: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

/** Roles that may manage email accounts. */
const ACCOUNT_MANAGERS = ['owner', 'admin'];

@Controller('inbox')
@UseGuards(JwtAuthGuard)
export class InboxController {
  private readonly logger = new Logger(InboxController.name);

  constructor(
    private readonly inbox: InboxService,
    private readonly poller: InboxPollerService,
  ) {}

  // ── Account management ────────────────────────────────────────────────────

  @Post('accounts')
  async addAccount(@Body() body: ConnectAccountDto, @Req() req: AuthRequest) {
    this._requireAccountManager(req);
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.addAccount(body, orgId);
      return { success: true, data };
    } catch (err) {
      this.logger.error('[inbox/accounts] add failed', err);
      return { success: false, error: (err as Error).message };
    }
  }

  @Get('accounts')
  async listAccounts(@Req() req: AuthRequest) {
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.listAccounts(orgId);
      return { success: true, data };
    } catch (err) {
      this.logger.error('[inbox/accounts] list failed', err);
      return { success: false, error: (err as Error).message };
    }
  }

  @Get('accounts/:id')
  async getAccount(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.getAccount(id, orgId);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Patch('accounts/:id')
  async updateAccount(
    @Param('id') id: string,
    @Body() body: UpdateAccountDto,
    @Req() req: AuthRequest,
  ) {
    this._requireAccountManager(req);
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.updateAccount(id, body, orgId);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Delete('accounts/:id')
  async deleteAccount(@Param('id') id: string, @Req() req: AuthRequest) {
    this._requireAccountManager(req);
    const orgId = req.user.organizationId;
    try {
      await this.inbox.deleteAccount(id, orgId);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('accounts/:id/test')
  async testAccount(@Param('id') id: string, @Req() req: AuthRequest) {
    this._requireAccountManager(req);
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.testAccount(id, orgId);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('accounts/:id/sync')
  async syncAccount(@Param('id') id: string, @Req() req: AuthRequest) {
    this._requireAccountManager(req);
    const orgId = req.user.organizationId;
    try {
      const newMessages = await this.inbox.syncAccount(id, orgId);
      return { success: true, data: { newMessages } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('sync')
  async syncAll(@Req() req: AuthRequest) {
    this._requireAccountManager(req);
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.syncAllAccounts(orgId);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // ── Message queries ───────────────────────────────────────────────────────

  @Get('messages')
  async listMessages(
    @Req() req: AuthRequest,
    @Query('accountId') accountId?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit')  limit  = '50',
    @Query('offset') offset = '0',
  ) {
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.listMessages(orgId, {
        accountId,
        unreadOnly: unreadOnly === 'true',
        limit:  Math.min(parseInt(limit,  10) || 50, 200),
        offset: Math.max(parseInt(offset, 10) || 0,   0),
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Get('messages/:id')
  async getMessage(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.getMessage(id, orgId);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('messages/:id/read')
  async markRead(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.user.organizationId;
    try {
      await this.inbox.markRead(id, orgId);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Get('messages/:id/summary')
  async getMessageSummary(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.user.organizationId;
    try {
      const data = await this.inbox.summarizeMessage(id, orgId);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _requireAccountManager(req: AuthRequest): void {
    if (!ACCOUNT_MANAGERS.includes(req.user.role)) {
      throw new ForbiddenException('Only owner or admin may manage email accounts');
    }
  }
}
