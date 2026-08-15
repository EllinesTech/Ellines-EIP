import { Module } from '@nestjs/common';
import { RemediationService } from './remediation.service';
import { RemediationPolicyService } from './remediation-policy.service';
import { LearnerModule } from '../learner/learner.module';
import { LearnerService } from '../learner/learner.service';

@Module({
  imports: [LearnerModule],
  providers: [
    RemediationPolicyService,
    RemediationService,
    {
      provide: 'LearnerService',
      useExisting: LearnerService,
    },
  ],
  exports: [RemediationService, RemediationPolicyService],
})
export class RemediationModule {}
