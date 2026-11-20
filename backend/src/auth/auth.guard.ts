import type { Request } from 'express'
import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { AdminAccountCheck } from './admin-account-check'
import { AuthService } from './auth.service'
import { verifySessionCookie } from './session-cookie'

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name)

  constructor(private authService: AuthService, private adminAccountCheck: AdminAccountCheck) {}

  canActivate(context: ExecutionContext): boolean {
    const payload = verifySessionCookie(context.switchToHttp().getRequest<Request>(), this.authService, this.logger, 'Auth guard')

    if (payload.role !== 'admin') {
      this.logger.warn('Auth guard: non-admin role rejected')
      throw new UnauthorizedException('Admin access required')
    }

    this.adminAccountCheck.assertStillAdmin(payload, 'Auth guard')

    this.logger.debug('Auth guard: token valid')
    return true
  }
}
