import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import router from '../router'
import { ApiError, useApi } from './useApi'
import { authenticated, role } from './useAuth'

function respond(status: number, body: unknown = { message: 'Invalid or expired token' }) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

describe('useApi 401 handling', () => {
  let push: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    authenticated.value = true
    role.value = 'admin'
    push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('resets the session and navigates to /login on a 401 from /api/users, still throwing ApiError', async () => {
    vi.stubGlobal('fetch', respond(401))

    await expect(useApi().get('/api/users')).rejects.toBeInstanceOf(ApiError)

    expect(authenticated.value).toBe(false)
    expect(role.value).toBeNull()
    expect(push).toHaveBeenCalledWith({ name: 'login' })
  })

  it.each([
    '/api/profile/password',
    '/api/auth/login',
    '/api/invites/abc/redeem',
    '/api/reset-tokens/abc/validate',
  ])('leaves the session alone on a 401 from %s', async (url) => {
    vi.stubGlobal('fetch', respond(401))

    await expect(useApi().post(url, {})).rejects.toBeInstanceOf(ApiError)

    expect(authenticated.value).toBe(true)
    expect(role.value).toBe('admin')
    expect(push).not.toHaveBeenCalled()
  })

  it('leaves the session alone on non-401 errors', async () => {
    vi.stubGlobal('fetch', respond(403))

    await expect(useApi().get('/api/users')).rejects.toBeInstanceOf(ApiError)

    expect(authenticated.value).toBe(true)
    expect(push).not.toHaveBeenCalled()
  })

  it('ends the session on a 401 from the admin-only /api/invites/:id/send', async () => {
    vi.stubGlobal('fetch', respond(401))

    await expect(useApi().post('/api/invites/3/send')).rejects.toBeInstanceOf(ApiError)

    expect(authenticated.value).toBe(false)
  })
})
