import { Module } from '@nestjs/common';
import { HubController } from './hub.controller';
import { ConnectorsModule } from './connectors/connectors.module';
import { DataMapperModule } from './data-mapper/data-mapper.module';
import { ConnectionResilienceModule } from './connection-resilience/connection-resilience.module';

@Module({
  imports: [
    ConnectorsModule,
    DataMapperModule,
    ConnectionResilienceModule,
  ],
  controllers: [HubController],
})
export class AppModule {}
