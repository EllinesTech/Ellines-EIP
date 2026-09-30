/**
 * InboxPollerService — Background IMAP polling scheduler
 *
 * Runs a check every 60 seconds. For each active EmailAccount whose
 * pollIntervalSeconds has elapsed since lastSyncedAt, delegates a sync
 * to InboxService.syncDueAccounts().
 *
 * This is NOT a long-lived persistent connection per account. It connects,
 * fetches new UIDs, then disconnects — consistent with the project's
 * scheduler pattern (connect-on-demand rather than persistent daemon).
 *
 * The interval is kept short (60 s check) so that accounts with a 5-minute
 * poll preference are serviced promptly within that window.
 *
 * Requirement: Email Inbox Window — new-email notification
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InboxService } from './inbox.service';

@Injectable()
export class InboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxPollerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /** How often to check which accounts are due for a sync (ms) */
  private readonly CHECK_INTERVAL_MS = 60_000; // 1 minute

  constructor(private readonly inbox: InboxService) {}

  onModuleInit(): void {
    this.logger.log('[InboxPoller] Starting poll loop (check every 60 s)');
    this.intervalHandle = setInterval(() => {
      void this._tick();
    }, this.CHECK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log('[InboxPoller] Poll loop stopped');
    }
  }

  /** Exposed so the HTTP layer can trigger an immediate on-demand sync. */
  async triggerNow(): Promise<void> {
    await this._tick();
  }

  private async _tick(): Promise<void> {
    try {
      await this.inbox.syncDueAccounts();
    } catch (err) {
      this.logger.error('[InboxPoller] tick error', err);
    }
  }
}
