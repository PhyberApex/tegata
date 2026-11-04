import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { GroupDeletionService } from './group-deletion.service'
import { GroupsController } from './groups.controller'
import { GroupsModule } from './groups.module'

@Module({
  imports: [AuthModule, GroupsModule, UsersModule],
  controllers: [GroupsController],
  providers: [GroupDeletionService],
})
export class GroupsApiModule {}
