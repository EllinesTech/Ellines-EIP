/**
 * Rate Limit Module (B.3.2)
 */

import { Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RateLimitController } from './rate-limit.controller';
import { RateLimitGuard } from './rate-limit.guard';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [RateLimitService, RateLimitGuard, PrismaService],
  controllers: [RateLimitController],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
