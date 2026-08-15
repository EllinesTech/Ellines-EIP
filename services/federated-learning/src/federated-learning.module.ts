import { Module } from '@nestjs/common';
import { FederatedLearningCoordinatorService } from './coordinator/federated-learning-coordinator.service';
import { FederatedLearningCoordinatorController } from './coordinator/federated-learning-coordinator.controller';
import { DifferentialPrivacyService } from './privacy/differential-privacy.service';
import { PoisoningDetectorService } from './poisoning/poisoning-detector.service';
import { FederatedAveragingService } from './aggregation/federated-averaging.service';
import { ModelDistributorService } from './distribution/model-distributor.service';
import { OrgParticipationService } from './participation/org-participation.service';
import { TransparencyReporterService } from './reporting/transparency-reporter.service';

/**
 * Federated Learning Module
 * Implements privacy-preserving federated learning across organizations
 */
@Module({
  controllers: [FederatedLearningCoordinatorController],
  providers: [
    FederatedLearningCoordinatorService,
    DifferentialPrivacyService,
    PoisoningDetectorService,
    FederatedAveragingService,
    ModelDistributorService,
    OrgParticipationService,
    TransparencyReporterService,
  ],
  exports: [FederatedLearningCoordinatorService],
})
export class FederatedLearningModule {}
