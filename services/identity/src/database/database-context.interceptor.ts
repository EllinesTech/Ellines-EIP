import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { DatabaseSwitcherService } from './database-switcher.service';

/**
 * DatabaseContextInterceptor sets up database context for each request.
 * 
 * On each incoming request:
 * 1. Extract organization ID from JWT (request.user.organizationId)
 * 2. Look up the primary database for that org
 * 3. Store in request context so repositories can use it
 * 
 * This allows automatic per-organization database switching without
 * modifying individual repository/controller code.
 * 
 * Usage:
 *   - Applied globally in AppModule
 *   - Or selectively on specific controllers
 */
@Injectable()
export class DatabaseContextInterceptor implements NestInterceptor {
  constructor(private dbSwitcher: DatabaseSwitcherService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();

    // Extract org ID from JWT (populated by auth guard)
    const organizationId = request.user?.organizationId;

    if (organizationId) {
      try {
        // Load active database config for this org
        const dbConfig = await this.dbSwitcher.getActiveDatabase(organizationId);

        // Store in request for later use
        request.dbContext = {
          organizationId,
          databaseConfig: dbConfig,
        };

        console.debug(
          `[DatabaseContext] Org ${organizationId} using database: ${dbConfig.type} (${dbConfig.host}:${dbConfig.port})`,
        );
      } catch (error) {
        console.warn(
          `[DatabaseContext] Failed to load DB config for org ${organizationId}, using default:`,
          error,
        );
        // Continue with default - don't fail the request
        request.dbContext = {
          organizationId,
          databaseConfig: { host: 'localhost', port: 5432, type: 'local' },
        };
      }
    } else {
      console.debug('[DatabaseContext] No organization in request, using default database');
    }

    return next.handle();
  }
}
