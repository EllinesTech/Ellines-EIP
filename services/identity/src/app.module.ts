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
import { ObservabilityModule } from './observability/observability.module';
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
    PrismaModule,
    AuthModule,
    OrgsModule,
    PlatformModule,
    EnterpriseModule,
    WorkflowModule,
    RbacModule,
    ObservabilityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
