import { Module } from '@nestjs/common';
import { HubController } from './hub.controller';
import { ConnectorsModule } from './connectors/connectors.module';
import { DataMapperModule } from './data-mapper/data-mapper.module';

@Module({
  imports: [ConnectorsModule, DataMapperModule],
  controllers: [HubController],
})
export class AppModule {}
