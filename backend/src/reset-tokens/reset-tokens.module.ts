import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { UsersModule } from '../users/users.module'
import { ResetTokensController } from './reset-tokens.controller'
import { ResetTokensService } from './reset-tokens.service'

@Module({
  imports: [AuthModule, UsersModule, MailModule],
  controllers: [ResetTokensController],
  providers: [ResetTokensService],
})
export class ResetTokensModule {}
