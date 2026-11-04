import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ProfileGuard } from '../auth/profile.guard'
import { UsersModule } from '../users/users.module'
import { ProfileController } from './profile.controller'

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [ProfileController],
  providers: [ProfileGuard],
})
export class ProfileModule {}
