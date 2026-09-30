import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Wraps ioredis as a NestJS-injectable service.
 *
 * Key naming convention (mandatory)
 * ──────────────────────────────────
 * All keys MUST follow the pattern:
 *   eip:{orgId}:{domain}:{key}
 *
 * Examples:
 *   eip:org_abc:snapshot:summary
 *   eip:org_abc:conversation:conv_123
 *   eip:platform:models:registry          ← platform-level (no org)
 *
 * The key-building helper `buildKey(orgId, domain, key)` enforces this
 * pattern automatically.  Pass `'platform'` as orgId for shared keys.
 *
 * Pub/Sub
 * ───────
 * `publish` and `subscribe` use a **dedicated** ioredis connection so
 * that subscriptions don't block the main command connection.
 *
 * Configuration (via environment / .env):
 *   REDIS_URL  — ioredis-compatible URL (optional).
 *                When absent the service runs in no-op mode: all reads
 *                return null/[], all writes are silent no-ops, and no
 *                TCP connections are ever opened.  This lets the identity
 *                service start cleanly on environments (local dev, CI)
 *                where Redis is not installed.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** Main connection — used for all non-pub/sub commands. */
  private readonly client: Redis | null;

  /** Dedicated subscriber connection. */
  private readonly subscriber: Redis | null;

  /** True when REDIS_URL is configured and connections were opened. */
  readonly isEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('REDIS_URL', '');

    if (!url) {
      // No Redis configured — run in silent no-op mode.
      this.isEnabled = false;
      this.client = null;
      this.subscriber = null;
      this.logger.warn(
        'REDIS_URL is not set — RedisService running in no-op mode. ' +
        'Set REDIS_URL to enable caching and pub/sub.',
      );
      return;
    }

    this.isEnabled = true;

    // Track whether we've already logged the first connection error so we
    // don't spam the log every 2 s when Redis is unavailable locally.
    let clientErrLogged = false;
    let subscriberErrLogged = false;

    const retryStrategy = (attempt: number): number | null => {
      // Exponential back-off: 500 ms, 1 s, 2 s … capped at 60 s.
      // Returning null would stop retrying entirely; we keep trying but
      // slow down aggressively so logs stay quiet.
      const delay = Math.min(500 * 2 ** attempt, 60_000);
      return delay;
    };

    this.client = new Redis(url, {
      lazyConnect: true,          // don't connect until first command
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy,
    });

    this.subscriber = new Redis(url, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy,
    });

    this.client.on('error', (err) => {
      if (!clientErrLogged) {
        this.logger.error('Redis client error — will retry silently. Start Redis to enable caching.', err);
        clientErrLogged = true;
      }
    });
    this.subscriber.on('error', (err) => {
      if (!subscriberErrLogged) {
        this.logger.error('Redis subscriber error — will retry silently.', err);
        subscriberErrLogged = true;
      }
    });

    // Reset log-once flag on successful reconnect so operators see the recovery.
    this.client.on('ready', () => {
      clientErrLogged = false;
      this.logger.log('Redis client connected ✓');
    });
    this.subscriber.on('ready', () => {
      subscriberErrLogged = false;
      this.logger.log('Redis subscriber connected ✓');
    });

    this.logger.log(`Redis client initialised (lazy) → ${this.redactUrl(url)}`);
  }

  // ─── Key helper ────────────────────────────────────────────────────────────

  /**
   * Build a namespaced key following the `eip:{orgId}:{domain}:{key}` pattern.
   *
   * @param orgId   Organisation ID (use `'platform'` for platform-level keys).
   * @param domain  Logical sub-domain, e.g. `'snapshot'`, `'conversation'`.
   * @param key     Specific key within the domain.
   */
  buildKey(orgId: string, domain: string, key: string): string {
    return `eip:${orgId}:${domain}:${key}`;
  }

  // ─── String operations ─────────────────────────────────────────────────────

  /**
   * Get the value of a key.  Returns `null` if the key does not exist or
   * Redis is not configured.
   */
  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  /**
   * Set the string value of a key (no expiry).
   * No-op when Redis is not configured.
   */
  async set(key: string, value: string): Promise<void> {
    if (!this.client) return;
    await this.client.set(key, value);
  }

  /**
   * Set the string value of a key with an expiry in seconds.
   * No-op when Redis is not configured.
   *
   * @param key      The Redis key.
   * @param seconds  Time-to-live in seconds.
   * @param value    The string value to store.
   */
  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.client) return;
    await this.client.setex(key, seconds, value);
  }

  /**
   * Delete one or more keys.
   * Returns 0 when Redis is not configured.
   *
   * @param keys  One or more keys to delete.
   */
  async del(...keys: string[]): Promise<number> {
    if (!this.client || keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  // ─── List operations ───────────────────────────────────────────────────────

  /**
   * Prepend one or more values to a list.
   * Returns 0 when Redis is not configured.
   *
   * @param key     The list key.
   * @param values  One or more values to prepend (left-push).
   * @returns       The new length of the list.
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.client) return 0;
    return this.client.lpush(key, ...values);
  }

  /**
   * Get a range of elements from a list.
   * Returns [] when Redis is not configured.
   *
   * @param key    The list key.
   * @param start  Start index (0-based, inclusive).
   * @param stop   Stop index (inclusive; -1 = last element).
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) return [];
    return this.client.lrange(key, start, stop);
  }

  // ─── Pub/Sub ───────────────────────────────────────────────────────────────

  /**
   * Delete all keys matching a glob pattern using SCAN + DEL (non-blocking).
   * Returns the number of keys deleted.
   * Returns 0 when Redis is not configured.
   *
   * Requirement 22.1: Domain-level cache invalidation.
   */
  async clearPattern(pattern: string): Promise<number> {
    if (!this.client) return 0;
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
    return deleted;
  }

  /**
   * Publish a message to a channel.
   * Returns 0 when Redis is not configured.
   *
   * @param channel  Channel name.
   * @param message  Message payload (string).
   * @returns        Number of subscribers that received the message.
   */
  async publish(channel: string, message: string): Promise<number> {
    if (!this.client) return 0;
    return this.client.publish(channel, message);
  }

  /**
   * Subscribe to one or more channels.
   * Silent no-op when Redis is not configured.
   *
   * @param channels    Channel names to subscribe to.
   * @param handler     Callback invoked for each message.
   */
  async subscribe(
    channels: string[],
    handler: (channel: string, message: string) => void,
  ): Promise<void> {
    if (!this.subscriber) return;
    await this.subscriber.subscribe(...channels);
    this.subscriber.on('message', handler);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    if (!this.isEnabled) return;
    await this.subscriber?.quit();
    await this.client?.quit();
    this.logger.log('Redis connections closed');
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private redactUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) parsed.password = '••••••••';
      return parsed.toString();
    } catch {
      return url;
    }
  }
}
