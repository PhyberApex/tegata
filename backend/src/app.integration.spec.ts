import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import * as argon2 from 'argon2'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from './app.module'
import { DEFAULT_TRUSTED_NETWORKS } from './auth/trusted-network'
import { configureApp } from './configure-app'

/**
 * The real AppModule with the same `configureApp` wiring `bootstrap()` applies, listening on an
 * ephemeral port and driven over HTTP. What this proves is the wiring itself — `trust proxy` turning
 * `X-Forwarded-For` into `req.ip`, the APP_GUARD throttler with the login override, the global
 * ValidationPipe and helmet — which the unit specs stub around.
 */
const PASSWORD = 'correct horse battery staple'
const JWT_SECRET = 'integration-spec-secret-of-at-least-32-chars'

interface BootedApp {
  baseUrl: string
  close: () => Promise<void>
}

async function bootApp(trustProxy: string, passwordHash: string): Promise<BootedApp> {
  const dir = mkdtempSync(join(tmpdir(), 'tegata-integration-'))
  const usersFile = join(dir, 'users_database.yml')
  writeFileSync(usersFile, 'users: {}\n')

  // Pinned so a developer's backend/.env cannot change what the image would do
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('TRUST_PROXY', trustProxy)
  vi.stubEnv('TEGATA_ADMIN_PASSWORD_HASH', passwordHash)
  vi.stubEnv('TEGATA_JWT_SECRET', JWT_SECRET)
  vi.stubEnv('TEGATA_DB_PATH', join(dir, 'tegata.db'))
  vi.stubEnv('AUTHELIA_USERS_FILE', usersFile)
  vi.stubEnv('NATIVE_LOGIN_CIDRS', DEFAULT_TRUSTED_NETWORKS)

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  const app: INestApplication = moduleRef.createNestApplication({ logger: false })
  configureApp(app, app.get(ConfigService))
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await app.close()
      vi.unstubAllEnvs()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** `POST /api/auth/login` as if relayed by a proxy for `forwardedFor`. */
function login(baseUrl: string, forwardedFor: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': forwardedFor },
    body: JSON.stringify(body),
  })
}

/** `GET /api/auth/methods` as if relayed by a proxy for `forwardedFor`. */
function authMethods(baseUrl: string, forwardedFor: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/methods`, {
    headers: { 'x-forwarded-for': forwardedFor },
  })
}

let passwordHash: string

beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD)
})

describe('the booted app behind one trusted proxy hop (TRUST_PROXY=1)', () => {
  let app: BootedApp

  beforeAll(async () => {
    app = await bootApp('1', passwordHash)
  })

  afterAll(async () => {
    await app?.close()
  })

  // Each case below forwards for its own client address, so the throttler, which keys on req.ip,
  // counts each case's requests in a bucket of its own.

  it('reads a public X-Forwarded-For as the caller and does not offer native login', async () => {
    const res = await authMethods(app.baseUrl, '8.8.8.8')

    expect(res.status).toBe(200)
    expect(((await res.json()) as { nativePasswordLogin: boolean }).nativePasswordLogin).toBe(false)
  })

  it('refuses native login from a public forwarded address with 403', async () => {
    const res = await login(app.baseUrl, '8.8.8.8', { password: PASSWORD })

    expect(res.status).toBe(403)
  })

  it('answers the sixth login within a minute with 429', async () => {
    const statuses: number[] = []
    for (let attempt = 0; attempt < 6; attempt++)
      statuses.push((await login(app.baseUrl, '10.0.0.6', { password: 'wrong' })).status)

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429])
  })

  it('rejects a non-string password with 400', async () => {
    const res = await login(app.baseUrl, '10.0.0.7', { password: 12345 })

    expect(res.status).toBe(400)
  })

  it('sets an HttpOnly, SameSite=Strict, Secure session cookie on a successful login', async () => {
    const res = await login(app.baseUrl, '10.0.0.8', { password: PASSWORD })

    expect(res.status).toBe(201)
    const cookie = res.headers.getSetCookie().find(c => c.startsWith('tegata_token='))
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(/;\s*HttpOnly/i)
    expect(cookie).toMatch(/;\s*SameSite=Strict/i)
    expect(cookie).toMatch(/;\s*Secure/i)
  })

  it('sends helmet\'s security headers', async () => {
    const res = await authMethods(app.baseUrl, '10.0.0.9')

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toContain('default-src \'self\'')
  })
})

describe('the booted app with no trusted proxy (TRUST_PROXY=0)', () => {
  let app: BootedApp

  beforeAll(async () => {
    app = await bootApp('0', passwordHash)
  })

  afterAll(async () => {
    await app?.close()
  })

  it('ignores X-Forwarded-For and offers native login to the loopback caller', async () => {
    const res = await authMethods(app.baseUrl, '8.8.8.8')

    expect(res.status).toBe(200)
    expect(((await res.json()) as { nativePasswordLogin: boolean }).nativePasswordLogin).toBe(true)
  })
})
