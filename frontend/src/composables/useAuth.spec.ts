import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { authenticated, redirectForSession, role, useAuth } from './useAuth'

describe('redirectForSession', () => {
  it.each([
    'users',
    'invites',
    'groups',
    'bundles',
  ])('redirects a self session away from %s to /profile', (routeName) => {
    expect(redirectForSession({ role: 'self', username: 'bob' }, routeName)).toBe('/profile')
  })

  it('does not redirect a self session already on /profile', () => {
    expect(redirectForSession({ role: 'self', username: 'bob' }, 'profile')).toBeNull()
  })

  it.each([
    'users',
    'invites',
    'groups',
    'bundles',
    'profile',
    undefined,
    null,
  ])('never redirects an OIDC admin session (route: %s)', (routeName) => {
    expect(redirectForSession({ role: 'admin', username: 'alice' }, routeName)).toBeNull()
  })

  it('sends a session with no username (Native Login) from /profile to /', () => {
    expect(redirectForSession({ role: 'admin', username: null }, 'profile')).toBe('/')
  })

  it.each([
    'users',
    'invites',
    'groups',
    'bundles',
  ])('lets a session with no username onto %s', (routeName) => {
    expect(redirectForSession({ role: 'admin', username: null }, routeName)).toBeNull()
  })
})

describe('logout', () => {
  const fetchMock = vi.fn()

  async function setUp() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          component: { template: '<div />' },
        },
        {
          path: '/login',
          component: { template: '<div />' },
        },
      ],
    })
    await router.push('/')
    const app = createApp({}).use(router)
    authenticated.value = true
    role.value = 'admin'
    return {
      router,
      auth: app.runWithContext(() => useAuth()),
    }
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('drops the client session and routes to /login when the request succeeds', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const { router, auth } = await setUp()

    await auth.logout()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))

    expect(authenticated.value).toBe(false)
    expect(role.value).toBeNull()
  })

  it('still drops the client session and routes to /login when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { router, auth } = await setUp()

    await auth.logout()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))

    expect(authenticated.value).toBe(false)
    expect(role.value).toBeNull()
  })
})
