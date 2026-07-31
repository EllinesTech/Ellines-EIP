import { Module } from '@nestjs/common';
import { EnterpriseModule } from '../enterprise/enterprise.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [EnterpriseModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
