import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { PlatformModule } from './platform/platform.module';
import { EnterpriseModule } from './enterprise/enterprise.module';
import { WorkflowModule } from './workflow/workflow.module';
import { RbacModule } from './rbac/rbac.module';
import { LoggingModule } from './logging/logging.module';
import { ObservabilityModule } from './observability/observability.module';
import { AgentsModule } from './agents/agents.module';
import { DatabaseModule } from './database/database.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { EllineaModule } from './ellinea/ellinea.module';
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module';
import { SelfHealingModule } from './self-healing/self-healing.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AlertsModule } from './alerts/alerts.module';
import { SecurityModule } from './security/security.module';
import { DataQualityModule } from './data-quality/data-quality.module';
import { DocumentsModule } from './documents/documents.module';
import { EmailModule } from './email/email.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { FleetModule } from './fleet/fleet.module';
import { SearchModule } from './search/search.module';
import { ReportsModule } from './reports/reports.module';
import { CommonModule } from './common/common.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthController } from './health.controller';
import { CorrelationMiddleware } from './logging/correlation.middleware';
import { LoggingMiddleware } from './middleware/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '..', '..', '.env'),
        join(__dirname, '..', '.env'),
        '.env',
      ],
    }),
    LoggingModule,
    PrismaModule,
    AuthModule,
    OrgsModule,
    PlatformModule,
    EnterpriseModule,
    WorkflowModule,
    RbacModule,
    ObservabilityModule,
    AgentsModule,
    DatabaseModule,
    RateLimitModule,
    EllineaModule,
    KnowledgeGraphModule,
    SelfHealingModule,
    AnalyticsModule,
    AlertsModule,
    SecurityModule,
    DataQualityModule,
    DocumentsModule,
    EmailModule,
    ConnectorsModule,
    FleetModule,
    SearchModule,
    ReportsModule,
    CommonModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID first (generates/propagates X-Correlation-ID),
    // then structured request logging — both on all routes.
    consumer
      .apply(CorrelationMiddleware, LoggingMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
