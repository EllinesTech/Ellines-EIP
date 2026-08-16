/**
 * DataQualityModule — NestJS module for Data Quality Service.
 * 
 * Exports the DataQualityService for injection into other modules.
 */

import { Module } from '@nestjs/common';
import { DataQualityService } from './data-quality.service';

@Module({
  providers: [DataQualityService],
  exports: [DataQualityService],
})
export class DataQualityModule {}
