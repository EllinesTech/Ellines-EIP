import { Module } from '@nestjs/common';
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
import { HealthController } from './health.controller';

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
