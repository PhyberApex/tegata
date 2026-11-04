import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { GroupsModule } from '../groups/groups.module'
import { BundlesController } from './bundles.controller'
import { BundlesService } from './bundles.service'

@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [BundlesController],
  providers: [BundlesService],
  exports: [BundlesService],
})
export class BundlesModule {}
