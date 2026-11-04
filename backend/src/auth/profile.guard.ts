import type { Request } from 'express'
import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { UsersService } from '../users/users.service'
import { AuthService } from './auth.service'
import { verifySessionCookie } from './session-cookie'

export interface ProfileRequest extends Request {
  username: string
}

/**
 * Lets a session act on its own account. Beyond the token's `sub`, the user it names is re-read from the
 * users database on every request, so an admin Disabling (or deleting) a user ends their self-service at
 * once rather than when their token expires — there is no other revocation. Provided by
 * `ProfileModule`, not `AuthModule`, because `UsersModule` already imports `AuthModule`.
 */
@Injectable()
export class ProfileGuard implements CanActivate {
  private readonly logger = new Logger(ProfileGuard.name)

  constructor(private authService: AuthService, private usersService: UsersService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ProfileRequest>()
    const payload = verifySessionCookie(request, this.authService, this.logger, 'Profile guard')

    if (!payload.sub) {
      this.logger.warn('Profile guard: token has no sub')
      throw new UnauthorizedException('Self-service access required')
    }

    if (!this.usersService.isEnabledUser(payload.sub)) {
      this.logger.warn(`Profile guard: ${payload.sub} is disabled or no longer exists`)
      throw new UnauthorizedException('This account is disabled or no longer exists')
    }

    request.username = payload.sub
    this.logger.debug('Profile guard: token valid')
    return true
  }
}
