import { Module } from '@nestjs/common';
import { EllineaController } from './ellinea.controller';

@Module({
  controllers: [EllineaController],
})
export class AppModule {}
