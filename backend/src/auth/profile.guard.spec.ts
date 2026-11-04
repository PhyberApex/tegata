import type { Mocked } from 'vitest'
import { ExecutionContext, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersService } from '../users/users.service'
import { AuthService } from './auth.service'
import { ProfileGuard, ProfileRequest } from './profile.guard'

describe('profileGuard', () => {
  let guard: ProfileGuard
  let mockAuthService: Mocked<Pick<AuthService, 'verifyToken'>>
  let mockUsersService: Mocked<Pick<UsersService, 'isEnabledUser'>>

  beforeEach(() => {
    mockAuthService = {
      verifyToken: vi.fn(),
    }
    mockUsersService = {
      isEnabledUser: vi.fn(() => true),
    }
    guard = new ProfileGuard(mockAuthService as unknown as AuthService, mockUsersService as unknown as UsersService)
  })

  function createContext(request: Partial<ProfileRequest>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext
  }

  it('should throw UnauthorizedException when no token cookie exists', () => {
    expect(() => guard.canActivate(createContext({ cookies: {} }))).toThrow(UnauthorizedException)
  })

  it('should throw UnauthorizedException when cookies object is undefined', () => {
    expect(() => guard.canActivate(createContext({}))).toThrow(UnauthorizedException)
  })

  it('should accept a token with sub present and role admin', () => {
    mockAuthService.verifyToken.mockReturnValue({ role: 'admin', sub: 'alice' })

    const request = {
      cookies: { tegata_token: 'admin-token' },
    } as Partial<ProfileRequest>
    expect(guard.canActivate(createContext(request))).toBe(true)
    expect(request.username).toBe('alice')
  })

  it('should accept a token with sub present and role self', () => {
    mockAuthService.verifyToken.mockReturnValue({ role: 'self', sub: 'bob' })

    const request = {
      cookies: { tegata_token: 'self-token' },
    } as Partial<ProfileRequest>
    expect(guard.canActivate(createContext(request))).toBe(true)
    expect(request.username).toBe('bob')
  })

  it('should throw UnauthorizedException for a token with no sub', () => {
    mockAuthService.verifyToken.mockReturnValue({ role: 'admin' })

    expect(() => guard.canActivate(createContext({
      cookies: { tegata_token: 'no-sub' },
    }))).toThrow(UnauthorizedException)
  })

  it('should throw UnauthorizedException when the token names a Disabled or deleted user', () => {
    mockAuthService.verifyToken.mockReturnValue({ role: 'self', sub: 'bob' })
    mockUsersService.isEnabledUser.mockReturnValue(false)

    const request = {
      cookies: { tegata_token: 'self-token' },
    } as Partial<ProfileRequest>
    expect(() => guard.canActivate(createContext(request))).toThrow(UnauthorizedException)
    expect(mockUsersService.isEnabledUser).toHaveBeenCalledWith('bob')
    expect(request.username).toBeUndefined()
  })

  it('should propagate a ServiceUnavailableException from an unreadable users database rather than a 401', () => {
    mockAuthService.verifyToken.mockReturnValue({ role: 'self', sub: 'bob' })
    mockUsersService.isEnabledUser.mockImplementation(() => {
      throw new ServiceUnavailableException('unreadable')
    })

    expect(() => guard.canActivate(createContext({
      cookies: { tegata_token: 'self-token' },
    }))).toThrow(ServiceUnavailableException)
  })

  it('should propagate errors from verifyToken', () => {
    mockAuthService.verifyToken.mockImplementation(() => {
      throw new UnauthorizedException('Invalid or expired token')
    })

    expect(() => guard.canActivate(createContext({
      cookies: { tegata_token: 'bad' },
    }))).toThrow(UnauthorizedException)
  })
})
