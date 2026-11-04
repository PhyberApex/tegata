import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { GroupsModule } from '../groups/groups.module'
import { MailModule } from '../mail/mail.module'
import { UsersModule } from '../users/users.module'
import { InvitesController } from './invites.controller'
import { InvitesService } from './invites.service'

@Module({
  imports: [
    AuthModule,
    GroupsModule,
    UsersModule,
    MailModule,
  ],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
