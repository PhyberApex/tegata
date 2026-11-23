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

describe('useApi error messages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function rejection(res: Response): Promise<ApiError> {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))
    const err = await useApi().get('/api/users').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    return err as ApiError
  }

  it('names the status when a proxy returns a non-JSON body with no status text (HTTP/2)', async () => {
    const err = await rejection(new Response('<html>Bad Gateway</html>', { status: 502, statusText: '' }))

    expect(err.message).not.toBe('')
    expect(err.message).toContain('502')
    expect(err.status).toBe(502)
  })

  it('falls back to the status text for a non-JSON body when there is one', async () => {
    const err = await rejection(new Response('<html>', { status: 503, statusText: 'Service Unavailable' }))

    expect(err.message).toBe('Service Unavailable')
  })

  it('names the status when a JSON body carries no message', async () => {
    const err = await rejection(new Response(JSON.stringify({ message: '' }), { status: 500, statusText: '' }))

    expect(err.message).toContain('500')
  })

  it('joins an array message (ValidationPipe) readably', async () => {
    const body = {
      message: ['email must be an email', 'username should not be empty'],
      error: 'Bad Request',
      statusCode: 400,
    }
    const err = await rejection(new Response(JSON.stringify(body), { status: 400 }))

    expect(err.message).toBe('email must be an email; username should not be empty')
    expect(err.body).toEqual(body)
  })

  it('passes a JSON message through and preserves body and status', async () => {
    const body = { message: 'Group is in use', confirmRequired: true }
    const err = await rejection(new Response(JSON.stringify(body), { status: 409 }))

    expect(err.message).toBe('Group is in use')
    expect(err.status).toBe(409)
    expect(err.body).toEqual(body)
  })

  it('treats a JSON body that is not an object as no body', async () => {
    const err = await rejection(new Response('null', { status: 500, statusText: '' }))

    expect(err.message).toContain('500')
    expect(err.body).toEqual({})
  })
})
