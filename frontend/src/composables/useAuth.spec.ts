import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { authenticated, redirectForRole, role, useAuth } from './useAuth'

describe('redirectForRole', () => {
  it.each([
    'users',
    'invites',
    'groups',
    'bundles',
  ])('redirects a self session away from %s to /profile', (routeName) => {
    expect(redirectForRole('self', routeName)).toBe('/profile')
  })

  it('does not redirect a self session already on /profile', () => {
    expect(redirectForRole('self', 'profile')).toBeNull()
  })

  it.each([
    'users',
    'invites',
    'groups',
    'bundles',
    'profile',
    undefined,
    null,
  ])('never redirects an admin session (route: %s)', (routeName) => {
    expect(redirectForRole('admin', routeName)).toBeNull()
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
