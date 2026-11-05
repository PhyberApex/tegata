import { Buffer } from 'node:buffer'
import { ConfigService } from '@nestjs/config'
import * as oidc from 'openid-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OidcService } from './oidc.service'

const ISSUER = 'https://auth.example.test'
const CLIENT_ID = 'tegata'
const REDIRECT_URI = 'https://tegata.example.test/api/auth/oidc/callback'

const CONFIG: Record<string, string> = {
  OIDC_ISSUER: ISSUER,
  OIDC_CLIENT_ID: CLIENT_ID,
  OIDC_CLIENT_SECRET: 'client-secret',
  OIDC_REDIRECT_URI: REDIRECT_URI,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** An ID token as Authelia's token endpoint returns it; the code flow checks its claims, not its signature. */
function idToken(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000)
  return [
    base64url({ alg: 'RS256', typ: 'JWT' }),
    base64url({
      iss: ISSUER,
      aud: CLIENT_ID,
      iat: now,
      exp: now + 300,
      ...claims,
    }),
    'signature',
  ].join('.')
}

interface Provider {
  token: () => Response
  userinfo: () => Response
}

// Every test talks to the provider the way openid-client does: fetch, stubbed at the boundary.
const fetchMock = vi.fn()

function urlOf(input: string | URL | Request) {
  return input instanceof Request
    ? input.url
    : input.toString()
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => urlOf(input))
}

function respondAs(provider: Provider) {
  fetchMock.mockImplementation((input: string | URL | Request) => {
    const url = urlOf(input)
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return Promise.resolve(jsonResponse({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/api/oidc/authorization`,
        token_endpoint: `${ISSUER}/api/oidc/token`,
        userinfo_endpoint: `${ISSUER}/api/oidc/userinfo`,
        jwks_uri: `${ISSUER}/jwks.json`,
      }))
    }
    if (url === `${ISSUER}/api/oidc/token`)
      return Promise.resolve(provider.token())
    if (url === `${ISSUER}/api/oidc/userinfo`)
      return Promise.resolve(provider.userinfo())
    return Promise.reject(new Error(`unexpected fetch ${url}`))
  })
}

function tokenResponse(extra: Record<string, unknown> = {}) {
  return () => jsonResponse({
    access_token: 'access-token',
    token_type: 'Bearer',
    expires_in: 300,
    ...extra,
  })
}

function callbackUrl(state: string) {
  return new URL(`${REDIRECT_URI}?code=auth-code&state=${state}&iss=${encodeURIComponent(ISSUER)}`)
}

function createService() {
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (CONFIG[key] === undefined)
        throw new Error(`Config key "${key}" is missing`)
      return CONFIG[key]
    }),
  }
  return new OidcService(config as unknown as ConfigService)
}

/** openid-client's wrapper around oauth4webapi's userinfo check: the subject it held the response to. */
function userinfoSubjectMismatch(expected: string) {
  return {
    cause: {
      cause: { attribute: 'sub', expected },
    },
  }
}

function exchange(service: OidcService) {
  const state = oidc.randomState()
  return service.exchangeCode(callbackUrl(state), state, oidc.randomPKCECodeVerifier())
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('oidcService.exchangeCode', () => {
  // README tells Authelia operators to configure token_endpoint_auth_method: client_secret_post.
  it('authenticates at the token endpoint with client_secret_post', async () => {
    respondAs({
      token: tokenResponse({
        id_token: idToken({ sub: 'user-sub' }),
      }),
      userinfo: () => jsonResponse({ sub: 'user-sub' }),
    })

    await exchange(createService())

    const [, init] = fetchMock.mock.calls.find(([input]) => urlOf(input) === `${ISSUER}/api/oidc/token`)!
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
    const body = new URLSearchParams(init.body)
    expect(body.get('client_id')).toBe(CLIENT_ID)
    expect(body.get('client_secret')).toBe('client-secret')
  })

  it('returns the userinfo groups and preferred username', async () => {
    respondAs({
      token: tokenResponse({
        id_token: idToken({ sub: 'user-sub' }),
      }),
      userinfo: () => jsonResponse({
        sub: 'user-sub',
        preferred_username: 'alice',
        groups: ['admins', 'media'],
      }),
    })

    await expect(exchange(createService())).resolves.toEqual({
      groups: ['admins', 'media'],
      username: 'alice',
    })
  })

  it('falls back to the subject when userinfo names no username, and to no groups', async () => {
    respondAs({
      token: tokenResponse({
        id_token: idToken({ sub: 'user-sub' }),
      }),
      userinfo: () => jsonResponse({ sub: 'user-sub' }),
    })

    await expect(exchange(createService())).resolves.toEqual({ groups: [], username: 'user-sub' })
  })

  // With no id_token there is no subject to hold userinfo to, so the exchange expects the
  // placeholder 'unknown' and a real provider's subject fails that check.
  it('rejects when the token response carries no id_token', async () => {
    respondAs({
      token: tokenResponse(),
      userinfo: () => jsonResponse({
        sub: 'user-sub',
        preferred_username: 'bob',
        groups: ['media'],
      }),
    })

    await expect(exchange(createService())).rejects.toMatchObject(userinfoSubjectMismatch('unknown'))
    expect(calledUrls()).toContain(`${ISSUER}/api/oidc/userinfo`)
  })

  it('rejects when userinfo answers for a different subject than the id_token', async () => {
    respondAs({
      token: tokenResponse({
        id_token: idToken({ sub: 'user-sub' }),
      }),
      userinfo: () => jsonResponse({ sub: 'someone-else', preferred_username: 'mallory' }),
    })

    await expect(exchange(createService())).rejects.toMatchObject(userinfoSubjectMismatch('user-sub'))
  })

  it('rejects when the token endpoint answers non-2xx', async () => {
    respondAs({
      token: () => jsonResponse({ error: 'invalid_grant', error_description: 'code expired' }, 400),
      userinfo: () => jsonResponse({ sub: 'user-sub' }),
    })

    await expect(exchange(createService())).rejects.toMatchObject({ error: 'invalid_grant' })
    expect(calledUrls()).toContain(`${ISSUER}/api/oidc/token`)
    expect(calledUrls()).not.toContain(`${ISSUER}/api/oidc/userinfo`)
  })

  it('discovers the provider once across exchanges', async () => {
    respondAs({
      token: tokenResponse({
        id_token: idToken({ sub: 'user-sub' }),
      }),
      userinfo: () => jsonResponse({ sub: 'user-sub', preferred_username: 'alice' }),
    })
    const service = createService()

    await exchange(service)
    await exchange(service)

    expect(calledUrls().filter(url => url.endsWith('/.well-known/openid-configuration'))).toHaveLength(1)
  })
})
