/**
 * SearchModule — Task 17.4
 *
 * Registers the CrossSystemSearchService and SearchController.
 *
 * Requirements 33.x: Cross-System Search
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrossSystemSearchService } from './cross-system-search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [CrossSystemSearchService],
  exports: [CrossSystemSearchService],
})
export class SearchModule {}
