import { Module } from '@nestjs/common';
import { HubController } from './hub.controller';
import { ConnectorsModule } from './connectors/connectors.module';
import { DataMapperModule } from './data-mapper/data-mapper.module';
import { ConnectionResilienceModule } from './connection-resilience/connection-resilience.module';
import { DataQualityModule } from './data-quality/data-quality.module';

@Module({
  imports: [
    ConnectorsModule,
    DataMapperModule,
    ConnectionResilienceModule,
    DataQualityModule,
  ],
  controllers: [HubController],
})
export class AppModule {}
