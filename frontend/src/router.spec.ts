import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticated, role } from './composables/useAuth'
import router from './router'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// The guard asks the backend who this session is: fetch, stubbed at the boundary.
const fetchMock = vi.fn()

// A fresh Response per call: a role redirect runs the guard again, and a body reads once.
function sessionIs(sessionRole: 'admin' | 'self') {
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ authenticated: true, role: sessionRole })))
}

async function navigate(path: string) {
  await router.push(path)
  return router.currentRoute.value
}

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock)
  // Each test starts from a public page with a stale session, so the guard's writes are visible.
  await router.push('/login')
  authenticated.value = true
  role.value = 'admin'
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('router guard', () => {
  it('lets a public route through without asking the backend', async () => {
    const route = await navigate('/register/abc')

    expect(route.name).toBe('register')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets an admin session onto an admin route and records the role', async () => {
    sessionIs('admin')
    authenticated.value = false
    role.value = null

    const route = await navigate('/groups')

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/check')
    expect(route.name).toBe('groups')
    expect(authenticated.value).toBe(true)
    expect(role.value).toBe('admin')
  })

  it('sends a self session from an admin route to its profile', async () => {
    sessionIs('self')

    const route = await navigate('/invites')

    expect(route.name).toBe('profile')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(role.value).toBe('self')
  })

  it('lets a self session onto its profile', async () => {
    sessionIs('self')

    const route = await navigate('/profile')

    expect(route.name).toBe('profile')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(role.value).toBe('self')
  })

  it('sends an unauthenticated session to login and forgets it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401))

    const route = await navigate('/groups')

    expect(route.name).toBe('login')
    expect(authenticated.value).toBe(false)
    expect(role.value).toBeNull()
  })

  it('sends the session to login when the backend cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const route = await navigate('/bundles')

    expect(route.name).toBe('login')
    expect(authenticated.value).toBe(false)
    expect(role.value).toBeNull()
  })
})
