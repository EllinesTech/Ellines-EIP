import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EllineaAuthStubGuard } from './auth-stub.guard';
import { EllineaController } from './ellinea.controller';

@Module({
  controllers: [EllineaController],
  providers: [{ provide: APP_GUARD, useClass: EllineaAuthStubGuard }],
})
export class AppModule {}
