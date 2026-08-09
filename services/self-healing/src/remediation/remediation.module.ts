import { Module } from '@nestjs/common';
import { RemediationService } from './remediation.service';
import { RemediationPolicyService } from './remediation-policy.service';

@Module({
  providers: [RemediationPolicyService, RemediationService],
  exports: [RemediationService, RemediationPolicyService],
})
export class RemediationModule {}
