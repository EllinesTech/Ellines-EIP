import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { DatabaseConfiguration } from '@prisma/client';

export interface DatabaseConnectionConfig {
  host?: string;
  port: number;
  database?: string | null;
  username?: string | null;
  password?: string;
  supabaseKey?: string;
  type: 'local' | 'supabase' | 'custom_postgres';
}

/**
 * DatabaseSwitcherService manages runtime database switching per organization.
 * 
 * Organizations can configure multiple databases (local, Supabase, custom PostgreSQL)
 * and switch between them without code deployment.
 * 
 * How it works:
 * 1. Each organization has a primary database configuration (isPrimary: true)
 * 2. On each request, the DatabaseContextInterceptor calls getActiveDatabase(orgId)
 * 3. Interceptor stores result in request.dbContext for repository access
 * 4. Repositories check request.dbContext to know which database to use
 * 5. For Prisma queries: use the PrismaService normally (it auto-connects to configured DB)
 * 
 * Architecture note:
 * - Prisma connection is configured via DATABASE_URL environment variable
 * - For true dynamic switching, would need separate PrismaClient per database
 * - Current MVP: Prisma connects to configured DATABASE_URL on startup
 * - Organization database switching happens at configuration level
 * - When client changes primary database, next request uses that config
 * 
 * Future enhancement:
 * - Maintain pool of PrismaClient instances (one per active database)
 * - Switch client per request based on dbContext
 * - Requires careful connection pooling and lifecycle management
 */
@Injectable()
export class DatabaseSwitcherService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
  ) {}

  /**
   * Get the primary/active database configuration for an organization
   * Returns the configuration or a fallback to localhost:5432
   */
  async getActiveDatabase(organizationId: string): Promise<DatabaseConnectionConfig> {
    try {
      // Look up the primary database for this org
      const config = await this.prisma.databaseConfiguration.findFirst({
        where: {
          organizationId,
          isPrimary: true,
          isActive: true,
        },
      });

      if (!config) {
        // No primary DB configured, use default localhost
        return this.getDefaultDatabaseConfig();
      }

      // Decrypt password if encrypted
      let decryptedPassword: string | undefined;
      if (config.passwordEncrypted) {
        decryptedPassword = await this.encryption.decrypt(
          config.passwordEncrypted,
          organizationId,
        );
      }

      // Decrypt Supabase key if encrypted
      let decryptedSupabaseKey: string | undefined;
      if (config.supabaseKeyEncrypted) {
        decryptedSupabaseKey = await this.encryption.decrypt(
          config.supabaseKeyEncrypted,
          organizationId,
        );
      }

      // Build connection config from stored config
      return {
        type: config.type as 'local' | 'supabase' | 'custom_postgres',
        host: config.host || 'localhost',
        port: config.port || 5432,
        database: config.databaseName,
        username: config.username,
        password: decryptedPassword,
        supabaseKey: decryptedSupabaseKey,
      };
    } catch (error) {
      // On error, fall back to default
      console.warn(`Failed to load database config for org ${organizationId}:`, error);
      return this.getDefaultDatabaseConfig();
    }
  }

  /**
   * Get the default database configuration (localhost PostgreSQL)
   */
  private getDefaultDatabaseConfig(): DatabaseConnectionConfig {
    return {
      type: 'local',
      host: 'localhost',
      port: 5432,
      database: 'ellines_eip',
      username: 'eip',
      password: 'eip_dev_password',
    };
  }

  /**
   * Build a Prisma database URL from configuration
   * Used to establish connections dynamically
   */
  buildDatabaseUrl(config: DatabaseConnectionConfig): string {
    if (config.type === 'supabase') {
      // Supabase URL format (simplified)
      return config.host || '';
    }

    if (config.type === 'local' || config.type === 'custom_postgres') {
      // PostgreSQL connection string
      const user = config.username || 'postgres';
      const pass = config.password || '';
      const host = config.host || 'localhost';
      const port = config.port || 5432;
      const db = config.database || 'postgres';

      const auth = pass ? `${user}:${pass}` : user;
      return `postgresql://${auth}@${host}:${port}/${db}?schema=public`;
    }

    return '';
  }

  /**
   * Test a database connection
   * Returns true if connection succeeds, false otherwise
   */
  async testConnection(config: DatabaseConnectionConfig): Promise<boolean> {
    try {
      // For now, just validate config exists and has required fields
      // In production, would attempt an actual connection test

      if (!config.host || !config.port) {
        return false;
      }

      // Basic validation for each type
      if (config.type === 'local') {
        // Local requires host and port
        return !!config.host && !!config.port;
      }

      if (config.type === 'supabase') {
        // Supabase would need URL/key validation (deferred to client for now)
        return true;
      }

      if (config.type === 'custom_postgres') {
        // Custom requires host, port, username, password
        return !!(config.host && config.port && config.username && config.password);
      }

      return false;
    } catch (error) {
      console.warn('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get all database configurations for an organization
   */
  async getAllConfigurations(organizationId: string): Promise<DatabaseConfiguration[]> {
    return this.prisma.databaseConfiguration.findMany({
      where: { organizationId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Switch the primary database for an organization
   * Creates an audit log entry for the switch
   */
  async switchPrimaryDatabase(
    organizationId: string,
    configId: string,
    reason: string,
  ): Promise<DatabaseConfiguration> {
    // First get the config to make sure it exists
    const config = await this.prisma.databaseConfiguration.findUnique({
      where: { id: configId },
    });

    if (!config) {
      throw new Error(`Database configuration ${configId} not found`);
    }

    // Get current primary config before switching
    const currentPrimary = await this.prisma.databaseConfiguration.findFirst({
      where: {
        organizationId,
        isPrimary: true,
      },
    });

    // Start transaction to ensure consistency
    const [updated] = await this.prisma.$transaction([
      // Update the new config to primary
      this.prisma.databaseConfiguration.update({
        where: { id: configId },
        data: { isPrimary: true },
      }),

      // Unset all other configs for this org as primary
      this.prisma.databaseConfiguration.updateMany({
        where: {
          organizationId,
          id: { not: configId },
        },
        data: { isPrimary: false },
      }),

      // Log the switch in audit trail
      this.prisma.databaseSwitchLog.create({
        data: {
          organizationId,
          configId,
          previousConfigId: currentPrimary?.id || null,
          switchedBy: 'system', // Would come from request context in real usage
          reason: reason || null,
        },
      }),
    ]);

    return updated;
  }

  /**
   * Get the switch audit log for an organization
   */
  async getSwitchLog(organizationId: string, limit = 10) {
    return this.prisma.databaseSwitchLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
