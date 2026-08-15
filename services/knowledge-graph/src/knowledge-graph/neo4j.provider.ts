/**
 * Neo4j Provider
 * 
 * Provides Neo4j driver connection for knowledge graph storage
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import neo4j, { Driver, Session } from 'neo4j-driver';

@Injectable()
export class Neo4jProvider implements OnModuleDestroy {
  private readonly logger = new Logger(Neo4jProvider.name);
  private driver: Driver | null = null;

  constructor() {
    this.initDriver();
  }

  private initDriver() {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';

    try {
      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      this.logger.log(`Neo4j driver initialized: ${uri}`);
    } catch (error: any) {
      this.logger.error(`Failed to initialize Neo4j driver: ${error?.message ?? String(error)}`);
    }
  }

  getDriver(): Driver {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized');
    }
    return this.driver;
  }

  getSession(): Session {
    return this.getDriver().session();
  }

  async onModuleDestroy() {
    if (this.driver) {
      await this.driver.close();
      this.logger.log('Neo4j driver closed');
    }
  }
}
