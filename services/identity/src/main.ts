import { config } from 'dotenv';
import { join } from 'path';

// Load monorepo root .env before Nest/Prisma initialize (override shell/system env)
config({ path: join(__dirname, '..', '..', '..', '.env'), override: true });
config({ path: join(__dirname, '..', '.env'), override: true });

// Initialize OpenTelemetry tracing FIRST (before any async operations)
import { initializeTracing } from './tracing/tracing';
initializeTracing();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ObservabilityInterceptor } from './middleware/observability.interceptor';
import { MetricsCollector } from './metrics/metrics-collector';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  // Register global observability interceptor
  const metricsCollector = app.get(MetricsCollector);
  app.useGlobalInterceptors(new ObservabilityInterceptor(metricsCollector));

  const configService = app.get(ConfigService);
  const corsRaw =
    configService.get<string>('CORS_ORIGINS') ||
    'http://localhost:3100,https://eip.ellines.co.ke,https://ellines-eip.pages.dev';
  const corsOrigins = corsRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow same-origin / curl / server-to-server (no Origin header)
      if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(
    process.env.PORT ||
      configService.get<string | number>('IDENTITY_SERVICE_PORT') ||
      3001,
  );

  await app.listen(port, '0.0.0.0');
  console.log(`Ellines EIP Identity Service listening on 0.0.0.0:${port}`);
  console.log(`Health: /api/v1/health`);
}

bootstrap();
