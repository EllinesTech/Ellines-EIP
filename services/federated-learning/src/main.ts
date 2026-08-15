import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Federated Learning');

  // Enable CORS
  app.enableCors();

  // Set global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Ellines EIP — Federated Learning Service')
    .setDescription('Privacy-preserving federated learning across organizations')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3007;
  await app.listen(port);

  logger.log(`✅ Federated Learning service listening on port ${port}`);
  logger.log(`📚 Swagger docs available at http://localhost:${port}/docs`);
}

bootstrap().catch((error) => {
  console.error('Failed to start Federated Learning service:', error);
  process.exit(1);
});
