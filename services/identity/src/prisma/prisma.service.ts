import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const maxAttempts = 5;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Connected to database');
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Database connect attempt ${attempt}/${maxAttempts} failed`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    }

    throw lastError;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
