import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { GroupsModule } from '../groups/groups.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
