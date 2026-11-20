import type { AuthTokenPayload } from './auth.service'
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { getRequiredGroup } from '../users/guarded-groups'
import { UsersService } from '../users/users.service'

/**
 * Re-reads the user an OIDC `admin` session names on every request, so Disabling, deleting or removing
 * an admin from `OIDC_REQUIRED_GROUP` ends their admin session at once rather than when the token
 * expires (ADR-0006). A token without `sub` is a Native Login session — the break-glass path, with no
 * user to check — and is always admitted. An Unreadable Users Database admits the session too: shutting
 * every OIDC admin out of the UI in exactly the state they need it to repair is worse than the gap.
 *
 * Provided by the global `AdminAccountCheckModule`, not `AuthModule`, because `UsersModule` already
 * imports `AuthModule`; being global, it resolves in every module that hosts `AuthGuard`.
 */
@Injectable()
export class AdminAccountCheck {
  private readonly logger = new Logger(AdminAccountCheck.name)

  constructor(private usersService: UsersService, private config: ConfigService) {}

  /** Throws 401 when `payload` is an OIDC admin session whose user is gone, Disabled or no longer an admin. */
  assertStillAdmin(payload: AuthTokenPayload, label: string): void {
    if (payload.role !== 'admin' || !payload.sub)
      return

    const lookup = this.usersService.lookupAccount(payload.sub)
    if (!lookup.readable) {
      this.logger.warn(`${label}: users database is unreadable, admitting ${payload.sub} without re-checking`)
      return
    }

    const requiredGroup = getRequiredGroup(this.config)
    const { user } = lookup
    if (!user || user.disabled || !user.groups.includes(requiredGroup)) {
      this.logger.warn(`${label}: ${payload.sub} is disabled, no longer exists, or is no longer in ${requiredGroup}`)
      throw new UnauthorizedException('This account is no longer an admin')
    }
  }
}
