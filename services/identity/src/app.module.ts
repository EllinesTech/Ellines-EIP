import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { PlatformModule } from './platform/platform.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Load monorepo root .env (services/identity → ../..)
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
  ],
  controllers: [HealthController],
})
export class AppModule {}