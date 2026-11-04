import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'node:net'
import type { Mocked } from 'vitest'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../auth/auth.service'
import { NativeLoginFence } from '../auth/native-login-fence'
import { ProfileGuard } from '../auth/profile.guard'
import { NativeLoginMetrics } from '../metrics/native-login-metrics'
import { UsersService } from '../users/users.service'
import { ProfileController } from './profile.controller'

/**
 * The real guard and controller over HTTP, with a real signed `self` token. `UsersService` is the one
 * stand-in (its own spec holds the real Disabled rule), so what this exercises is the cookie, the JWT and
 * the guard refusing before any handler runs.
 */
describe('profile over HTTP', () => {
  let app: INestApplication
  let baseUrl: string
  let token: string
  const users: Record<string, { disabled: boolean }> = {}
  const usersService: Mocked<Pick<UsersService, 'isEnabledUser' | 'updateUser' | 'verifyPassword' | 'resetPassword'>> = {
    isEnabledUser: vi.fn((username: string) => Boolean(users[username]) && !users[username].disabled),
    updateUser: vi.fn(),
    verifyPassword: vi.fn(async () => true),
    resetPassword: vi.fn(async () => undefined),
  }

  beforeAll(async () => {
    const config = {
      get: (_key: string, fallback: string) => fallback,
      getOrThrow: (key: string) => ({ TEGATA_ADMIN_PASSWORD_HASH: 'unused', TEGATA_JWT_SECRET: 'spec-secret' })[key],
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        AuthService,
        NativeLoginFence,
        ProfileGuard,
        { provide: ConfigService, useValue: config },
        {
          provide: NativeLoginMetrics,
          useValue: {
            record: vi.fn(),
          },
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile()

    app = moduleRef.createNestApplication({ logger: false })
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`
    token = moduleRef.get(AuthService).loginWithOidc('bob', false)
  })

  beforeEach(() => {
    users.bob = { disabled: false }
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  function send(method: string, path: string, body: object) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Cookie': `tegata_token=${token}` },
      body: JSON.stringify(body),
    })
  }

  function patchProfile() {
    return send('PATCH', '/profile', { email: 'bob@example.com' })
  }

  function changePassword() {
    return send('POST', '/profile/password', { currentPassword: 'old-password', newPassword: 'new-password' })
  }

  it('should let an enabled user change their email and password', async () => {
    expect((await patchProfile()).status).toBe(200)
    expect((await changePassword()).status).toBe(201)
    expect(usersService.updateUser).toHaveBeenCalledWith('bob', { email: 'bob@example.com' })
    expect(usersService.resetPassword).toHaveBeenCalledWith('bob', 'new-password')
  })

  it('should answer 401 to a Disabled user\'s still-valid session and change nothing', async () => {
    users.bob.disabled = true

    expect((await patchProfile()).status).toBe(401)
    expect((await changePassword()).status).toBe(401)
    expect(usersService.updateUser).not.toHaveBeenCalled()
    expect(usersService.verifyPassword).not.toHaveBeenCalled()
    expect(usersService.resetPassword).not.toHaveBeenCalled()
  })

  it('should answer 401 once the user has been deleted', async () => {
    delete users.bob

    expect((await patchProfile()).status).toBe(401)
    expect(usersService.updateUser).not.toHaveBeenCalled()
  })
})
