import type { Logger } from '@nestjs/common'
import type { Request } from 'express'
import type { AuthService, AuthTokenPayload } from './auth.service'
import { UnauthorizedException } from '@nestjs/common'

/**
 * The verified payload of the request's `tegata_token` cookie — the half both
 * guards share before each applies its own claim check. Throws 401 on a missing
 * cookie; an invalid one throws from `verifyToken`.
 */
export function verifySessionCookie(
  request: Request,
  authService: Pick<AuthService, 'verifyToken'>,
  logger: Logger,
  label: string,
): AuthTokenPayload {
  const token = request.cookies?.tegata_token

  if (!token) {
    logger.warn(`${label}: missing token`)
    throw new UnauthorizedException('Not authenticated')
  }

  return authService.verifyToken(token)
}
