import { Module } from '@nestjs/common';
import { ForecastingService } from './forecasting/forecasting.service';

@Module({
  providers: [ForecastingService],
  exports: [ForecastingService],
})
export class AppModule {}
