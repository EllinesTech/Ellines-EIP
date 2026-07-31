import { Module } from '@nestjs/common';
import { HubController } from './hub.controller';

@Module({
  controllers: [HubController],
})
export class AppModule {}
