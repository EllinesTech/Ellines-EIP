import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session, Transaction, RecordShape } from 'neo4j-driver';

export type Neo4jQueryParams = Record<string, unknown>;

/**
 * Wraps the Neo4j driver as a NestJS-injectable service.
 *
 * Tenant isolation contract
 * ─────────────────────────
 * Every Cypher query that touches tenant-owned nodes MUST supply
 * `{ orgId: string }` in `params` and the query MUST contain a
 * `WHERE n.organization_id = $orgId` (or equivalent) clause.
 * This service enforces no automatic injection — it is the caller's
 * responsibility to include the filter.  Cross-tenant reads are a
 * critical defect (workspace rule §6).
 *
 * Configuration (via environment / .env):
 *   NEO4J_URI      — bolt/neo4j URI (default: bolt://localhost:7687)
 *   NEO4J_USER     — username (default: neo4j)
 *   NEO4J_PASSWORD — password (required)
 *   NEO4J_DATABASE — default database (default: neo4j)
 */
@Injectable()
export class Neo4jService implements OnModuleDestroy {
  private readonly logger = new Logger(Neo4jService.name);
  private readonly driver: Driver;
  private readonly defaultDatabase: string;

  constructor(private readonly config: ConfigService) {
    const uri = config.get<string>('NEO4J_URI', 'bolt://localhost:7687');
    const user = config.get<string>('NEO4J_USER', 'neo4j');
    const password = config.get<string>('NEO4J_PASSWORD', '');
    this.defaultDatabase = config.get<string>('NEO4J_DATABASE', 'neo4j');

    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      // Disable implicit transaction locking around reads so we can
      // run explicit transactions with fine-grained control.
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 10_000,
      logging: neo4j.logging.console('warn'),
    });

    this.logger.log(`Neo4j driver initialised → ${uri}`);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Execute a single read-or-write Cypher query.
   *
   * @param cypher  Cypher query string.  Must include tenant filter when
   *                reading/writing tenant-owned nodes.
   * @param params  Named parameters (object).  Include `{ orgId }` for every
   *                tenant-scoped query.
   * @param db      Optional database name (falls back to NEO4J_DATABASE).
   * @returns       Array of result records cast to T.
   */
  async runQuery<T extends RecordShape = RecordShape>(
    cypher: string,
    params: Neo4jQueryParams = {},
    db?: string,
  ): Promise<T[]> {
    const session = this.openSession(db);
    try {
      const result = await session.run<T>(cypher, params);
      return result.records.map((r) => r.toObject() as T);
    } finally {
      await session.close();
    }
  }

  /**
   * Execute multiple Cypher statements inside a single explicit transaction.
   * The callback receives the transaction object; it must NOT commit or
   * rollback — the wrapper handles that.
   *
   * @param fn  Async function receiving the open Transaction.
   * @param db  Optional target database.
   */
  async runTransaction<T>(
    fn: (tx: Transaction) => Promise<T>,
    db?: string,
  ): Promise<T> {
    const session = this.openSession(db);
    let tx: Transaction | undefined;
    try {
      tx = session.beginTransaction();
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (err) {
      if (tx) {
        await tx.rollback().catch((rollbackErr) => {
          this.logger.error('Transaction rollback failed', rollbackErr);
        });
      }
      throw err;
    } finally {
      await session.close();
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    await this.driver.close();
    this.logger.log('Neo4j driver closed');
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private openSession(db?: string): Session {
    return this.driver.session({
      database: db ?? this.defaultDatabase,
    });
  }
}
