import type { Mocked } from 'vitest'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { NativeLoginFence } from './native-login-fence'
import { OidcService } from './oidc.service'

// openid-client is ESM-only; vitest loads it natively, so this mock exists to
// keep oidc.service.ts's import from reaching the real discovery/network
// calls, not to work around a loader limitation.
vi.mock('openid-client', () => ({
  discovery: vi.fn(),
  randomPKCECodeVerifier: vi.fn().mockReturnValue('mock-verifier'),
  calculatePKCECodeChallenge: vi.fn().mockResolvedValue('mock-challenge'),
  randomState: vi.fn().mockReturnValue('mock-state'),
  buildAuthorizationUrl: vi.fn().mockReturnValue(new URL('https://auth.example.com/authorize')),
  authorizationCodeGrant: vi.fn(),
}))

describe('authController', () => {
  let controller: AuthController
  let mockAuthService: Mocked<Pick<AuthService, 'login' | 'verifyToken' | 'loginWithOidc'>>
  let mockOidcService: Mocked<Pick<OidcService, 'buildAuthorizationUrl' | 'exchangeCode' | 'getRequiredGroup'>>

  beforeEach(async () => {
    mockAuthService = {
      login: vi.fn(),
      verifyToken: vi.fn(),
      loginWithOidc: vi.fn(),
    }

    mockOidcService = {
      buildAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      getRequiredGroup: vi.fn().mockReturnValue('tegata'),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: OidcService, useValue: mockOidcService },
        {
          provide: ConfigService,
          useValue: {
            get: (_key: string, fallback: string) => fallback,
          },
        },
        NativeLoginFence,
      ],
    }).compile()

    controller = module.get<AuthController>(AuthController)
  })

  describe('login', () => {
    it('should set cookie and return success on valid login', async () => {
      mockAuthService.login.mockResolvedValue('jwt-token-123')
      const mockRes = {
        cookie: vi.fn(),
      } as any

      const result = await controller.login({ password: 'admin-pass' }, { ip: '192.168.1.42' } as any, mockRes)

      expect(mockAuthService.login).toHaveBeenCalledWith('admin-pass', '192.168.1.42')
      expect(mockRes.cookie).toHaveBeenCalledWith('tegata_token', 'jwt-token-123', expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 86400000,
      }))
      expect(result).toEqual({ success: true })
    })

    it('should hand the service the source address of a caller outside the fence unchanged', async () => {
      mockAuthService.login.mockRejectedValue(new ForbiddenException('nope'))
      const mockRes = {
        cookie: vi.fn(),
      } as any

      await expect(controller.login({ password: 'admin-pass' }, { ip: '203.0.113.5' } as any, mockRes))
        .rejects
        .toThrow(ForbiddenException)

      expect(mockAuthService.login).toHaveBeenCalledWith('admin-pass', '203.0.113.5')
      expect(mockRes.cookie).not.toHaveBeenCalled()
    })

    it('should propagate error if login fails', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid password'))
      const mockRes = {
        cookie: vi.fn(),
      } as any

      await expect(controller.login({ password: 'bad' }, { ip: '192.168.1.42' } as any, mockRes)).rejects.toThrow('Invalid password')
    })
  })

  describe('methods', () => {
    it('should offer native password login to a caller inside the fence', () => {
      expect(controller.methods({ ip: '192.168.1.42' } as any)).toEqual({ nativePasswordLogin: true, usernamePattern: '^[a-z0-9][a-z0-9._-]{0,63}$', siteName: 'Tegata' })
    })

    it('should withhold native password login from a caller outside the fence', () => {
      expect(controller.methods({ ip: '203.0.113.5' } as any)).toEqual({ nativePasswordLogin: false, usernamePattern: '^[a-z0-9][a-z0-9._-]{0,63}$', siteName: 'Tegata' })
    })
  })

  describe('logout', () => {
    it('should clear cookie and return success', () => {
      const mockRes = {
        clearCookie: vi.fn(),
      } as any

      const result = controller.logout(mockRes)

      expect(mockRes.clearCookie).toHaveBeenCalledWith('tegata_token')
      expect(result).toEqual({ success: true })
    })
  })

  describe('check', () => {
    it('should return authenticated true with role for a valid token', () => {
      mockAuthService.verifyToken.mockReturnValue({ role: 'admin' })
      const mockReq = {
        cookies: { tegata_token: 'valid' },
      } as any

      expect(controller.check(mockReq)).toEqual({ authenticated: true, role: 'admin' })
    })

    it('should report a self role for a self-session token', () => {
      mockAuthService.verifyToken.mockReturnValue({ role: 'self', sub: 'bob' })
      const mockReq = {
        cookies: { tegata_token: 'valid' },
      } as any

      expect(controller.check(mockReq)).toEqual({ authenticated: true, role: 'self' })
    })

    it('should throw UnauthorizedException when no token cookie exists', () => {
      const mockReq = { cookies: {} } as any

      expect(() => controller.check(mockReq)).toThrow(UnauthorizedException)
    })
  })

  describe('oidcLogin', () => {
    it('should set oidc_state cookie and redirect to authorization url', async () => {
      mockOidcService.buildAuthorizationUrl.mockResolvedValue({
        url: 'https://auth.example.com/authorize?state=abc',
        state: 'abc',
        codeVerifier: 'verifier123',
      })
      const mockRes = {
        cookie: vi.fn(),
        redirect: vi.fn(),
      } as any

      await controller.oidcLogin(mockRes)

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'oidc_state',
        JSON.stringify({ state: 'abc', codeVerifier: 'verifier123' }),
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
      )
      expect(mockRes.redirect).toHaveBeenCalledWith('https://auth.example.com/authorize?state=abc')
    })

    it('should redirect to login on error', async () => {
      mockOidcService.buildAuthorizationUrl.mockRejectedValue(new Error('discovery failed'))
      const mockRes = {
        cookie: vi.fn(),
        redirect: vi.fn(),
      } as any

      await controller.oidcLogin(mockRes)

      expect(mockRes.redirect).toHaveBeenCalledWith('/login?error=sso_failed')
    })
  })

  describe('oidcCallback', () => {
    it('should issue tegata_token cookie with admin role and redirect to / when in required group', async () => {
      mockOidcService.exchangeCode.mockResolvedValue({
        groups: ['tegata'],
        username: 'alice',
      })
      mockAuthService.loginWithOidc.mockReturnValue('jwt-oidc-token')
      const mockReq = {
        cookies: {
          oidc_state: JSON.stringify({ state: 'abc', codeVerifier: 'ver' }),
        },
        originalUrl: '/api/auth/oidc/callback?code=xyz&state=abc',
        protocol: 'https',
        get: vi.fn().mockReturnValue('tegata.example.com'),
      } as any
      const mockRes = {
        clearCookie: vi.fn(),
        cookie: vi.fn(),
        redirect: vi.fn(),
      } as any

      await controller.oidcCallback(mockReq, mockRes)

      expect(mockAuthService.loginWithOidc).toHaveBeenCalledWith('alice', true)
      expect(mockRes.cookie).toHaveBeenCalledWith('tegata_token', 'jwt-oidc-token', expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
      }))
      expect(mockRes.redirect).toHaveBeenCalledWith('/')
    })

    it('should issue tegata_token cookie with self role and redirect to / when not in required group', async () => {
      mockOidcService.exchangeCode.mockResolvedValue({
        groups: ['other'],
        username: 'bob',
      })
      mockAuthService.loginWithOidc.mockReturnValue('jwt-oidc-token-self')
      const mockReq = {
        cookies: {
          oidc_state: JSON.stringify({ state: 'abc', codeVerifier: 'ver' }),
        },
        originalUrl: '/api/auth/oidc/callback?code=xyz&state=abc',
        protocol: 'https',
        get: vi.fn().mockReturnValue('tegata.example.com'),
      } as any
      const mockRes = {
        clearCookie: vi.fn(),
        cookie: vi.fn(),
        redirect: vi.fn(),
      } as any

      await controller.oidcCallback(mockReq, mockRes)

      expect(mockAuthService.loginWithOidc).toHaveBeenCalledWith('bob', false)
      expect(mockRes.cookie).toHaveBeenCalledWith('tegata_token', 'jwt-oidc-token-self', expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
      }))
      expect(mockRes.redirect).toHaveBeenCalledWith('/')
    })

    it('should redirect to sso_failed if oidc_state cookie is missing', async () => {
      const mockReq = {
        cookies: {},
        get: vi.fn(),
      } as any
      const mockRes = {
        clearCookie: vi.fn(),
        redirect: vi.fn(),
      } as any

      await controller.oidcCallback(mockReq, mockRes)

      expect(mockRes.redirect).toHaveBeenCalledWith('/login?error=sso_failed')
    })

    it('should redirect to sso_failed if code exchange throws', async () => {
      mockOidcService.exchangeCode.mockRejectedValue(new Error('token exchange failed'))
      const mockReq = {
        cookies: {
          oidc_state: JSON.stringify({ state: 'abc', codeVerifier: 'ver' }),
        },
        originalUrl: '/api/auth/oidc/callback?code=bad&state=abc',
        protocol: 'https',
        get: vi.fn().mockReturnValue('tegata.example.com'),
      } as any
      const mockRes = {
        clearCookie: vi.fn(),
        cookie: vi.fn(),
        redirect: vi.fn(),
      } as any

      await controller.oidcCallback(mockReq, mockRes)

      expect(mockRes.redirect).toHaveBeenCalledWith('/login?error=sso_failed')
    })
  })
})
