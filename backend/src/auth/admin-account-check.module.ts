import { Global, Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module'
import { AdminAccountCheck } from './admin-account-check'

/**
 * Global so `AuthGuard` — instantiated in every module whose controllers use it — and `AuthController`
 * can resolve `AdminAccountCheck` without `AuthModule` importing `UsersModule`, which imports `AuthModule`.
 */
@Global()
@Module({
  imports: [UsersModule],
  providers: [AdminAccountCheck],
  exports: [AdminAccountCheck],
})
export class AdminAccountCheckModule {}
