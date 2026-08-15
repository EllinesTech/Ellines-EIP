/**
 * Document Generation Service — App Module
 *
 * Generates professional documents in multiple formats:
 * Excel, PDF, Word, PowerPoint, CSV, JSON, XML
 * with organisation branding and delivery mechanisms.
 *
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8
 */

import { Module } from '@nestjs/common';
import { DocumentGenerationModule } from './document-generation/document-generation.module';

@Module({
  imports: [DocumentGenerationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
