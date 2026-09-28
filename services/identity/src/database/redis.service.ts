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
 *   REDIS_URL  — ioredis-compatible URL (default: redis://localhost:6379)
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** Main connection — used for all non-pub/sub commands. */
  private readonly client: Redis;

  /** Dedicated subscriber connection. */
  private readonly subscriber: Redis;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.client = new Redis(url, {
      lazyConnect: false,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    this.subscriber = new Redis(url, {
      lazyConnect: false,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) =>
      this.logger.error('Redis client error', err),
    );
    this.subscriber.on('error', (err) =>
      this.logger.error('Redis subscriber error', err),
    );

    this.logger.log(`Redis client initialised → ${this.redactUrl(url)}`);
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
   * Get the value of a key.  Returns `null` if the key does not exist.
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Set the string value of a key (no expiry).
   */
  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  /**
   * Set the string value of a key with an expiry in seconds.
   *
   * @param key      The Redis key.
   * @param seconds  Time-to-live in seconds.
   * @param value    The string value to store.
   */
  async setex(key: string, seconds: number, value: string): Promise<void> {
    await this.client.setex(key, seconds, value);
  }

  /**
   * Delete one or more keys.
   *
   * @param keys  One or more keys to delete.
   */
  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  // ─── List operations ───────────────────────────────────────────────────────

  /**
   * Prepend one or more values to a list.
   *
   * @param key     The list key.
   * @param values  One or more values to prepend (left-push).
   * @returns       The new length of the list.
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.client.lpush(key, ...values);
  }

  /**
   * Get a range of elements from a list.
   *
   * @param key    The list key.
   * @param start  Start index (0-based, inclusive).
   * @param stop   Stop index (inclusive; -1 = last element).
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  // ─── Pub/Sub ───────────────────────────────────────────────────────────────

  /**
   * Publish a message to a channel.
   *
   * @param channel  Channel name.
   * @param message  Message payload (string).
   * @returns        Number of subscribers that received the message.
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  /**
   * Subscribe to one or more channels.
   *
   * @param channels    Channel names to subscribe to.
   * @param handler     Callback invoked for each message.
   */
  async subscribe(
    channels: string[],
    handler: (channel: string, message: string) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(...channels);
    this.subscriber.on('message', handler);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.quit();
    await this.client.quit();
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
