import { Module } from '@nestjs/common';
import { AlertCorrelationService } from './alert-correlation.service';

@Module({
  providers: [AlertCorrelationService],
  exports: [AlertCorrelationService],
})
export class AlertCorrelationModule {}
