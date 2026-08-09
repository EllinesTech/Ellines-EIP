import { Module } from '@nestjs/common';
import { RemediationService } from './remediation.service';
import { RemediationPolicyService } from './remediation-policy.service';

@Module({
  providers: [RemediationService, RemediationPolicyService],
  exports: [RemediationService, RemediationPolicyService],
})
export class RemediationModule {}
