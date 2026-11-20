import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestLoggerMiddleware } from './request-logger.middleware'

let warn: ReturnType<typeof vi.spyOn>
let debug: ReturnType<typeof vi.spyOn>
let verbose: ReturnType<typeof vi.spyOn>

function run(method: string, originalUrl: string, statusCode: number, contentLength = '42'): string {
  const listeners: Record<string, () => void> = {}
  const req: any = { method, originalUrl }
  const res: any = {
    statusCode,
    get: (h: string) => (h.toLowerCase() === 'content-length'
      ? contentLength
      : undefined),
    on: (event: string, cb: () => void) => {
      listeners[event] = cb
      return res
    },
  }
  const next = vi.fn()
  new RequestLoggerMiddleware().use(req, res, next)
  expect(next).toHaveBeenCalledOnce()
  listeners.finish()
  const calls = [warn, debug, verbose].flatMap(s => s.mock.calls)
  expect(calls).toHaveLength(1)
  return calls[0][0] as string
}

beforeEach(() => {
  vi.useFakeTimers()
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
  verbose = vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('requestLoggerMiddleware', () => {
  const SECRET = 'S3CRET-tok_abc123'

  it.each([
    [
      'POST',
      `/api/invites/${SECRET}/redeem`,
      409,
      'POST /api/invites/[redacted]/redeem',
    ],
    [
      'GET',
      `/api/invites/${SECRET}/validate`,
      200,
      'GET /api/invites/[redacted]/validate',
    ],
    [
      'POST',
      `/api/reset-tokens/${SECRET}/redeem`,
      400,
      'POST /api/reset-tokens/[redacted]/redeem',
    ],
    [
      'GET',
      `/api/reset-tokens/${SECRET}/validate`,
      404,
      'GET /api/reset-tokens/[redacted]/validate',
    ],
    [
      'POST',
      `/API/Invites/${SECRET}/Redeem/`,
      400,
      'POST /API/Invites/[redacted]/Redeem/',
    ],
    [
      'GET',
      `/api/status?token=${SECRET}`,
      401,
      'GET /api/status?…',
    ],
    [
      'GET',
      `/api/auth/oidc/callback?code=${SECRET}&state=${SECRET}`,
      302,
      'GET /api/auth/oidc/callback?…',
    ],
  ])('redacts the secret from %s %s', (method, url, status, expectedPrefix) => {
    const line = run(method, url, status)
    expect(line).not.toContain(SECRET)
    expect(line).toBe(`${expectedPrefix} → ${status} (0ms, 42b)`)
  })

  it('logs ordinary URLs unchanged', () => {
    expect(run('GET', '/api/users/alice', 200)).toBe('GET /api/users/alice → 200 (0ms, 42b)')
  })

  it('leaves admin invite routes addressed by id unchanged', () => {
    expect(run('POST', '/api/invites/12/send', 500)).toBe('POST /api/invites/12/send → 500 (0ms, 42b)')
  })

  it('keeps level selection: warn for >= 400, debug otherwise, verbose for health', () => {
    run('GET', '/api/users', 404)
    expect(warn).toHaveBeenCalledOnce()
    vi.clearAllMocks()
    run('GET', '/api/users', 200)
    expect(debug).toHaveBeenCalledOnce()
    vi.clearAllMocks()
    run('GET', '/api/health?x=1', 500)
    expect(verbose).toHaveBeenCalledOnce()
  })

  it('reports duration and a dash when content-length is missing', () => {
    const listeners: Record<string, () => void> = {}
    const res: any = {
      statusCode: 200,
      get: () => undefined,
      on: (e: string, cb: () => void) => { listeners[e] = cb },
    }
    new RequestLoggerMiddleware().use({ method: 'GET', originalUrl: '/x' } as any, res, () => {})
    vi.advanceTimersByTime(15)
    listeners.finish()
    expect(debug).toHaveBeenCalledWith('GET /x → 200 (15ms, -b)')
  })
})
