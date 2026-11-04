import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { GroupsModule } from '../groups/groups.module'
import { AccessPreviewController } from './access-preview.controller'
import { AccessPreviewService } from './access-preview.service'

@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [AccessPreviewController],
  providers: [AccessPreviewService],
})
export class AccessPreviewModule {}
