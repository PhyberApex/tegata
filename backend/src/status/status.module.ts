import { Module } from '@nestjs/common'
import { InvitesModule } from '../invites/invites.module'
import { UsersModule } from '../users/users.module'
import { StatusController } from './status.controller'
import { StatusService } from './status.service'

@Module({
  imports: [UsersModule, InvitesModule],
  providers: [StatusService],
  controllers: [StatusController],
})
export class StatusModule {}
