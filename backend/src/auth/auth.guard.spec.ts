import type { Mocked } from 'vitest'
import type { AccountLookup, PublicUser } from '../users/users.service'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersService } from '../users/users.service'
import { AdminAccountCheck } from './admin-account-check'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

/** A readable lookup of alice, an Enabled member of the default required group unless overridden. */
function aliceLookup(overrides: Partial<PublicUser> = {}): AccountLookup {
  return {
    readable: true,
    user: {
      username: 'alice',
      displayname: 'Alice',
      email: '',
      groups: ['tegata'],
      disabled: false,
      ...overrides,
    },
  }
}

describe('authGuard', () => {
  let guard: AuthGuard
  let mockAuthService: Mocked<Pick<AuthService, 'verifyToken'>>
  let mockUsersService: Mocked<Pick<UsersService, 'lookupAccount'>>

  function buildGuard(config: ConfigService = {
    get: (_key: string, fallback: string) => fallback,
  } as unknown as ConfigService) {
    return new AuthGuard(
      mockAuthService as unknown as AuthService,
      new AdminAccountCheck(mockUsersService as unknown as UsersService, config),
    )
  }

  beforeEach(() => {
    mockAuthService = {
      verifyToken: vi.fn(),
    }
    mockUsersService = {
      lookupAccount: vi.fn().mockReturnValue(aliceLookup()),
    }
    guard = buildGuard()
  })

  function createContext(cookies: Record<string, string> = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ cookies }),
      }),
    } as unknown as ExecutionContext
  }

  it('should throw UnauthorizedException when no token cookie exists', () => {
    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException)
  })

  it('should throw UnauthorizedException when cookies object is undefined', () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as unknown as ExecutionContext

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException)
  })

  it('should call verifyToken with the cookie value', () => {
    mockAuthService.verifyToken.mockReturnValue({ role: 'admin' })

    guard.canActivate(createContext({ tegata_token: 'my-jwt' }))

    expect(mockAuthService.verifyToken).toHaveBeenCalledWith('my-jwt')
  })

  it('should return true when token is valid', () => {
    mockAuthService.verifyToken.mockReturnValue({ role: 'admin' })

    expect(guard.canActivate(createContext({ tegata_token: 'valid' }))).toBe(true)
  })

  it('should throw UnauthorizedException for a structurally valid self-role token', () => {
    mockAuthService.verifyToken.mockReturnValue({ role: 'self', sub: 'alice' })

    expect(() => guard.canActivate(createContext({ tegata_token: 'self-token' }))).toThrow(UnauthorizedException)
  })

  it('should propagate errors from verifyToken', () => {
    mockAuthService.verifyToken.mockImplementation(() => {
      throw new UnauthorizedException('Invalid or expired token')
    })

    expect(() => guard.canActivate(createContext({ tegata_token: 'bad' }))).toThrow(
      UnauthorizedException,
    )
  })

  describe('re-checking an OIDC admin session against the users database', () => {
    beforeEach(() => {
      mockAuthService.verifyToken.mockReturnValue({ role: 'admin', sub: 'alice' })
    })

    it('should admit an admin who is still Enabled and in the required group', () => {
      expect(guard.canActivate(createContext({ tegata_token: 'oidc' }))).toBe(true)
      expect(mockUsersService.lookupAccount).toHaveBeenCalledWith('alice')
    })

    it('should refuse an admin who has since been Disabled', () => {
      mockUsersService.lookupAccount.mockReturnValue(aliceLookup({ disabled: true }))

      expect(() => guard.canActivate(createContext({ tegata_token: 'oidc' }))).toThrow(UnauthorizedException)
    })

    it('should refuse an admin who has since been deleted', () => {
      mockUsersService.lookupAccount.mockReturnValue({ readable: true, user: null })

      expect(() => guard.canActivate(createContext({ tegata_token: 'oidc' }))).toThrow(UnauthorizedException)
    })

    it('should refuse an admin who is no longer in the required group', () => {
      mockUsersService.lookupAccount.mockReturnValue(aliceLookup({
        groups: ['users'],
      }))

      expect(() => guard.canActivate(createContext({ tegata_token: 'oidc' }))).toThrow(UnauthorizedException)
    })

    it('should read the required group from OIDC_REQUIRED_GROUP', () => {
      guard = buildGuard({
        get: (key: string, fallback: string) => key === 'OIDC_REQUIRED_GROUP'
          ? 'admins'
          : fallback,
      } as unknown as ConfigService)

      expect(() => guard.canActivate(createContext({ tegata_token: 'oidc' }))).toThrow(UnauthorizedException)

      mockUsersService.lookupAccount.mockReturnValue(aliceLookup({
        groups: ['admins'],
      }))
      expect(guard.canActivate(createContext({ tegata_token: 'oidc' }))).toBe(true)
    })

    it('should admit the session when the users database is Unreadable', () => {
      mockUsersService.lookupAccount.mockReturnValue({ readable: false })

      expect(guard.canActivate(createContext({ tegata_token: 'oidc' }))).toBe(true)
    })

    it('should always admit a native session, which carries no sub, without reading the users database', () => {
      mockAuthService.verifyToken.mockReturnValue({ role: 'admin' })
      mockUsersService.lookupAccount.mockReturnValue({ readable: true, user: null })

      expect(guard.canActivate(createContext({ tegata_token: 'native' }))).toBe(true)
      expect(mockUsersService.lookupAccount).not.toHaveBeenCalled()
    })
  })
})
