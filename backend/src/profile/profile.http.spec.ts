import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'node:net'
import type { Mocked } from 'vitest'
import { ConflictException, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import { sign } from 'jsonwebtoken'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../auth/auth.service'
import { NativeLoginFence } from '../auth/native-login-fence'
import { ProfileGuard } from '../auth/profile.guard'
import { NativeLoginMetrics } from '../metrics/native-login-metrics'
import { UnverifiablePasswordHashException, UsersService } from '../users/users.service'
import { ProfileController } from './profile.controller'

/**
 * The real guard and controller over HTTP, with a real signed `self` token. `UsersService` is the one
 * stand-in (its own spec holds the real Disabled rule), so what this exercises is the cookie, the JWT and
 * the guard refusing before any handler runs.
 */
const JWT_SECRET = 'spec-secret'

describe('profile over HTTP', () => {
  let app: INestApplication
  let baseUrl: string
  let token: string
  let nativeToken: string
  const users: Record<string, { disabled: boolean }> = {}
  const usersService: Mocked<Pick<UsersService, 'isEnabledUser' | 'lookupAccount' | 'updateUser' | 'verifyPassword' | 'resetPassword'>> = {
    isEnabledUser: vi.fn((username: string) => Boolean(users[username]) && !users[username].disabled),
    lookupAccount: vi.fn((username: string) => ({
      readable: true as const,
      user: {
        username,
        displayname: 'Bob',
        email: 'bob@example.com',
        groups: ['users'],
        disabled: false,
      },
    })),
    updateUser: vi.fn(),
    verifyPassword: vi.fn(async () => true),
    resetPassword: vi.fn(async () => undefined),
  }

  beforeAll(async () => {
    const config = {
      get: (_key: string, fallback: string) => fallback,
      getOrThrow: (key: string) => ({ TEGATA_ADMIN_PASSWORD_HASH: 'unused', TEGATA_JWT_SECRET: JWT_SECRET })[key],
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
    // A Native Login session: what `AuthService.login` signs, without going through the Break-Glass Fence.
    nativeToken = sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  })

  beforeEach(() => {
    users.bob = { disabled: false }
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  function send(method: string, path: string, body?: object, session = token) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Cookie': `tegata_token=${session}` },
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
    })
  }

  function getProfile(session = token) {
    return send('GET', '/profile', undefined, session)
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

  it('should return the caller\'s username, displayname and email, and not their groups', async () => {
    const res = await getProfile()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ username: 'bob', displayname: 'Bob', email: 'bob@example.com' })
    expect(usersService.lookupAccount).toHaveBeenCalledWith('bob')
  })

  it('should answer 401 to a Native Login session, which has no sub, and read nothing', async () => {
    expect((await getProfile(nativeToken)).status).toBe(401)
    expect(usersService.lookupAccount).not.toHaveBeenCalled()
  })

  it('should answer 422 with the admin-reset message when the stored hash is not one Tegata can verify', async () => {
    usersService.verifyPassword.mockRejectedValueOnce(new UnverifiablePasswordHashException())

    const res = await changePassword()

    expect(res.status).toBe(422)
    expect(((await res.json()) as { message: string }).message).toBe(new UnverifiablePasswordHashException().message)
    expect(usersService.resetPassword).not.toHaveBeenCalled()
  })

  it('should answer 409 without naming the other account when the email is already on another user', async () => {
    usersService.updateUser.mockImplementationOnce(() => {
      throw new ConflictException('That email address is already in use')
    })

    const res = await send('PATCH', '/profile', { email: 'alice@example.com' })

    expect(res.status).toBe(409)
    expect(((await res.json()) as { message: string }).message).toBe('That email address is already in use')
  })

  it.each(['', '   '])('should answer 400 to the blank displayname %j and change nothing', async (displayname) => {
    expect((await send('PATCH', '/profile', { displayname })).status).toBe(400)
    expect(usersService.updateUser).not.toHaveBeenCalled()
  })

  it.each(['displayname', 'email'])('should answer 400 to a null %s and change nothing', async (field) => {
    expect((await send('PATCH', '/profile', { [field]: null })).status).toBe(400)
    expect(usersService.updateUser).not.toHaveBeenCalled()
  })

  it('should store a displayname with its surrounding whitespace trimmed', async () => {
    expect((await send('PATCH', '/profile', { displayname: '  Alice  ' })).status).toBe(200)
    expect(usersService.updateUser).toHaveBeenCalledWith('bob', { displayname: 'Alice' })
  })

  it('should answer 401 to a Disabled user\'s still-valid session and change nothing', async () => {
    users.bob.disabled = true

    expect((await getProfile()).status).toBe(401)
    expect((await patchProfile()).status).toBe(401)
    expect((await changePassword()).status).toBe(401)
    expect(usersService.lookupAccount).not.toHaveBeenCalled()
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
