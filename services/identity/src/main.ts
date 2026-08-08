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
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
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

  // Setup Swagger API documentation (B.3.3)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ellines EIP API')
    .setDescription(
      'Enterprise Intelligence Platform API - Connect, observe, and orchestrate your enterprise systems with AI-powered insights.',
    )
    .setVersion('2.0.0')
    .setContact(
      'Ellines Tech',
      'https://ellines.co.ke',
      'ellines.tech@gmail.com',
    )
    .setLicense('Proprietary', 'https://ellines.co.ke/license')
    .addServer('http://localhost:3001', 'Local Development')
    .addServer('https://eip.ellines.co.ke', 'Production')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User authentication and session management')
    .addTag('Organizations', 'Organization management and settings')
    .addTag('Users', 'User management and profiles')
    .addTag('Connectors', 'Data connector installation and sync')
    .addTag('Dashboards', 'Custom BI dashboards and widgets')
    .addTag('Workflows', 'Approval workflows and business rules')
    .addTag('Agents', 'Autonomous AI agents and templates')
    .addTag('RBAC', 'Role-based access control and custom roles')
    .addTag('Rate Limits', 'API rate limiting and tier management')
    .addTag('Platform', 'Platform administration')
    .addTag('Ellinea AI', 'Ellinea AI intelligence and insights')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Ellines EIP API Documentation',
    customfavIcon: 'https://ellines.co.ke/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  });

  const port = Number(
    process.env.PORT ||
      configService.get<string | number>('IDENTITY_SERVICE_PORT') ||
      3001,
  );

  await app.listen(port, '0.0.0.0');
  console.log(`Ellines EIP Identity Service listening on 0.0.0.0:${port}`);
  console.log(`Health: /api/v1/health`);
  console.log(`API Docs: http://0.0.0.0:${port}/api/docs`);
}

bootstrap();
