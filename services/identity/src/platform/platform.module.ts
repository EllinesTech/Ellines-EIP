import { Module } from '@nestjs/common';
import { EnterpriseModule } from '../enterprise/enterprise.module';
import { OrgsModule } from '../orgs/orgs.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { ConnectorsModule } from '../connectors/connectors.module';

@Module({
  imports: [EnterpriseModule, OrgsModule, ConnectorsModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
