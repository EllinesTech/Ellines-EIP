import { Module } from '@nestjs/common';
import { FederatedLearningModule } from './federated-learning.module';

@Module({
  imports: [FederatedLearningModule],
})
export class AppModule {}
