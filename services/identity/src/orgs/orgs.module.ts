import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { MultiOrgService } from './multi-org.service';

@Module({
  imports: [AuthModule],
  controllers: [OrgsController],
  providers: [OrgsService, MultiOrgService],
  exports: [OrgsService, MultiOrgService],
})
export class OrgsModule {}
