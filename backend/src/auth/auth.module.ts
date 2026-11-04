import { Module } from '@nestjs/common'
import { MetricsModule } from '../metrics/metrics.module'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { NativeLoginFence } from './native-login-fence'
import { OidcService } from './oidc.service'

@Module({
  imports: [MetricsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    NativeLoginFence,
    OidcService,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
