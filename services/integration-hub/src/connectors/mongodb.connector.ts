/**
 * MongoDB Connector (NoSQL)
 * Requirement 22.3: MongoDB connector
 */

import { Injectable, Logger } from '@nestjs/common';

export interface MongoDBConnectorConfig {
  connectionString: string;
  database: string;
  timeout?: number;
}

export interface MongoQueryResult {
  documents: any[];
  count: number;
  latencyMs: number;
}

@Injectable()
export class MongoDBConnector {
  private readonly logger = new Logger(MongoDBConnector.name);
  // client stored per connectionString to allow reuse
  private clients: Map<string, any> = new Map();

  private async getClient(config: MongoDBConnectorConfig): Promise<any> {
    if (this.clients.has(config.connectionString)) {
      return this.clients.get(config.connectionString);
    }

    // Dynamic import to avoid hard dependency when mongo isn't installed
    try {
      const { MongoClient } = (await import('mongodb' as any)) as any;
      const client = new MongoClient(config.connectionString, {
        serverSelectionTimeoutMS: config.timeout ?? 5000,
      });
      await client.connect();
      this.clients.set(config.connectionString, client);
      this.logger.log(`MongoDB connected: ${config.database}`);
      return client;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`MongoDB connection failed: ${msg}`);
      throw error;
    }
  }

  async find(
    config: MongoDBConnectorConfig,
    collection: string,
    filter: Record<string, any> = {},
    options: { limit?: number; skip?: number; sort?: Record<string, 1 | -1> } = {},
  ): Promise<MongoQueryResult> {
    const startTime = Date.now();
    const client = await this.getClient(config);
    const db = client.db(config.database);
    const col = db.collection(collection);

    let cursor = col.find(filter);
    if (options.sort) cursor = cursor.sort(options.sort);
    if (options.skip) cursor = cursor.skip(options.skip);
    if (options.limit) cursor = cursor.limit(options.limit);

    const documents = await cursor.toArray();
    return { documents, count: documents.length, latencyMs: Date.now() - startTime };
  }

  async aggregate(
    config: MongoDBConnectorConfig,
    collection: string,
    pipeline: any[],
  ): Promise<MongoQueryResult> {
    const startTime = Date.now();
    const client = await this.getClient(config);
    const documents = await client.db(config.database).collection(collection).aggregate(pipeline).toArray();
    return { documents, count: documents.length, latencyMs: Date.now() - startTime };
  }

  async listCollections(config: MongoDBConnectorConfig): Promise<string[]> {
    const client = await this.getClient(config);
    const cols = await client.db(config.database).listCollections().toArray();
    return cols.map((c: any) => c.name);
  }

  async testConnection(config: MongoDBConnectorConfig): Promise<boolean> {
    try {
      const client = await this.getClient(config);
      await client.db(config.database).command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(connectionString: string): Promise<void> {
    const client = this.clients.get(connectionString);
    if (client) {
      await client.close();
      this.clients.delete(connectionString);
    }
  }
}
