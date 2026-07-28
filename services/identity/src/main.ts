import { config } from 'dotenv';
import { join } from 'path';

// Load monorepo root .env before Nest/Prisma initialize (override shell/system env)
config({ path: join(__dirname, '..', '..', '..', '.env'), override: true });
config({ path: join(__dirname, '..', '.env'), override: true });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('IDENTITY_SERVICE_PORT', 3001);

  await app.listen(port);
  console.log(`Ellines EIP Identity Service listening on http://localhost:${port}`);
  console.log(`Health: http://localhost:${port}/api/v1/health`);
}

bootstrap();
