import type { Mocked } from 'vitest'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

describe('authGuard', () => {
  let guard: AuthGuard
  let mockAuthService: Mocked<Pick<AuthService, 'verifyToken'>>

  beforeEach(() => {
    mockAuthService = {
      verifyToken: vi.fn(),
    }
    guard = new AuthGuard(mockAuthService as unknown as AuthService)
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
})
