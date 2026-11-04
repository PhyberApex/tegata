import type { Mock } from 'vitest'
import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import * as argon2 from 'argon2'
import { sign, verify } from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeLoginMetrics } from '../metrics/native-login-metrics'
import { AuthService } from './auth.service'
import { NativeLoginFence } from './native-login-fence'

vi.mock('argon2')
vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(() => 'mocked-jwt-token'),
  verify: vi.fn(),
}))

const JWT_SECRET = 'test-secret'
const PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$hash'

const INSIDE = '192.168.1.42'
const OUTSIDE = '203.0.113.5'

describe('authService', () => {
  let service: AuthService
  let mockConfig: Record<string, string>
  let nativeLogins: { record: Mock }

  beforeEach(async () => {
    vi.clearAllMocks()
    mockConfig = {
      TEGATA_ADMIN_PASSWORD_HASH: PASSWORD_HASH,
      TEGATA_JWT_SECRET: JWT_SECRET,
    }
    nativeLogins = {
      record: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: NativeLoginMetrics, useValue: nativeLogins },
        NativeLoginFence,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((_key: string, fallback: string) => fallback),
            getOrThrow: vi.fn((key: string) => {
              if (mockConfig[key] === undefined)
                throw new Error(`Config key "${key}" is missing`)
              return mockConfig[key]
            }),
          },
        },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
  })

  describe('validatePassword', () => {
    it('should return true for a valid password', async () => {
      ;(argon2.verify as Mock).mockResolvedValue(true)

      const result = await service.validatePassword('correct-password')

      expect(result).toBe(true)
      expect(argon2.verify).toHaveBeenCalledWith(PASSWORD_HASH, 'correct-password')
    })

    it('should return false for an invalid password', async () => {
      ;(argon2.verify as Mock).mockResolvedValue(false)

      const result = await service.validatePassword('wrong-password')

      expect(result).toBe(false)
    })
  })

  describe('login', () => {
    it('should return a JWT token on valid password from inside the fence', async () => {
      ;(argon2.verify as Mock).mockResolvedValue(true)

      const token = await service.login('correct-password', INSIDE)

      expect(token).toBe('mocked-jwt-token')
      expect(sign).toHaveBeenCalledWith({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' })
    })

    it('should log a successful break-glass login at warn with the source address', async () => {
      ;(argon2.verify as Mock).mockResolvedValue(true)
      const warn = vi.spyOn(Logger.prototype, 'warn')

      await service.login('correct-password', INSIDE)

      expect(warn).toHaveBeenCalledWith(expect.stringContaining(INSIDE))
    })

    it('should increment tegata_native_login_total on a successful login', async () => {
      ;(argon2.verify as Mock).mockResolvedValue(true)

      await service.login('correct-password', INSIDE)

      expect(nativeLogins.record).toHaveBeenCalledTimes(1)
    })

    it('should throw UnauthorizedException on invalid password from inside the fence', async () => {
      ;(argon2.verify as Mock).mockResolvedValue(false)

      await expect(service.login('wrong-password', INSIDE)).rejects.toThrow(UnauthorizedException)
      expect(nativeLogins.record).not.toHaveBeenCalled()
    })

    it('should refuse a login from outside the fence with ForbiddenException', async () => {
      ;(argon2.verify as Mock).mockResolvedValue(true)

      await expect(service.login('correct-password', OUTSIDE)).rejects.toThrow(ForbiddenException)
    })

    it('should never check the password for a request from outside the fence', async () => {
      ;(argon2.verify as Mock).mockResolvedValue(true)

      await expect(service.login('correct-password', OUTSIDE)).rejects.toThrow(ForbiddenException)

      expect(argon2.verify).not.toHaveBeenCalled()
      expect(sign).not.toHaveBeenCalled()
      expect(nativeLogins.record).not.toHaveBeenCalled()
    })

    it('should log a refusal at warn naming the source address', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn')

      await expect(service.login('correct-password', OUTSIDE)).rejects.toThrow(ForbiddenException)

      expect(warn).toHaveBeenCalledWith(expect.stringContaining(OUTSIDE))
    })

    it('should refuse a login whose source address could not be read at all', async () => {
      await expect(service.login('correct-password', undefined)).rejects.toThrow(ForbiddenException)
      expect(argon2.verify).not.toHaveBeenCalled()
    })
  })

  describe('loginWithOidc', () => {
    it('should sign role: admin with sub when isAdmin is true', () => {
      const token = service.loginWithOidc('alice', true)

      expect(token).toBe('mocked-jwt-token')
      expect(sign).toHaveBeenCalledWith({ role: 'admin', sub: 'alice' }, JWT_SECRET, { expiresIn: '24h' })
    })

    it('should sign role: self with sub when isAdmin is false', () => {
      const token = service.loginWithOidc('bob', false)

      expect(token).toBe('mocked-jwt-token')
      expect(sign).toHaveBeenCalledWith({ role: 'self', sub: 'bob' }, JWT_SECRET, { expiresIn: '24h' })
    })
  })

  describe('verifyToken', () => {
    it('should return decoded payload for a valid token', () => {
      ;(verify as Mock).mockReturnValue({ role: 'admin' })

      const result = service.verifyToken('valid-token')

      expect(result).toEqual({ role: 'admin' })
      expect(verify).toHaveBeenCalledWith('valid-token', JWT_SECRET)
    })

    it('should throw UnauthorizedException for an invalid token', () => {
      ;(verify as Mock).mockImplementation(() => { throw new Error('jwt malformed') })

      expect(() => service.verifyToken('bad-token')).toThrow(UnauthorizedException)
    })
  })
})
