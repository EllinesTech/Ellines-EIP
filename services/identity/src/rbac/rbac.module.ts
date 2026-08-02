import { Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PermissionService, RbacService],
  controllers: [RbacController],
  exports: [PermissionService, RbacService],
})
export class RbacModule {}
