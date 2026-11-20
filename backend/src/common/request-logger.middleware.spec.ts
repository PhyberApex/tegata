import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestLoggerMiddleware } from './request-logger.middleware'

let warn: ReturnType<typeof vi.spyOn>
let debug: ReturnType<typeof vi.spyOn>
let verbose: ReturnType<typeof vi.spyOn>

interface LoggedRequest {
  method?: string
  url: string
  status: number
  // null: no content-length header on the response
  contentLength?: string | null
  elapsedMs?: number
}

// Drives the middleware through one request and returns the single line it logged
function logLineFor({ method = 'GET', url, status, contentLength = '42', elapsedMs = 0 }: LoggedRequest): string {
  vi.clearAllMocks()
  const listeners: Record<string, () => void> = {}
  const req: any = { method, originalUrl: url }
  const res: any = {
    statusCode: status,
    get: (h: string) => (h.toLowerCase() === 'content-length'
      ? contentLength ?? undefined
      : undefined),
    on: (event: string, cb: () => void) => {
      listeners[event] = cb
      return res
    },
  }
  const next = vi.fn()
  new RequestLoggerMiddleware().use(req, res, next)
  expect(next).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(elapsedMs)
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
      'POST',
      `/api//invites/${SECRET}/redeem/x`,
      404,
      'POST /api//invites/[redacted]/redeem/x',
    ],
    [
      'GET',
      `/register/${SECRET}`,
      200,
      'GET /register/[redacted]',
    ],
    [
      'GET',
      `/reset/${SECRET}/`,
      200,
      'GET /reset/[redacted]/',
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
    const line = logLineFor({ method, url, status })
    expect(line).not.toContain(SECRET)
    expect(line).toBe(`${expectedPrefix} → ${status} (0ms, 42b)`)
  })

  it('logs ordinary URLs unchanged', () => {
    expect(logLineFor({ url: '/api/users/alice', status: 200 })).toBe('GET /api/users/alice → 200 (0ms, 42b)')
  })

  it('leaves admin invite and reset-token routes addressed by id unchanged', () => {
    expect(logLineFor({ method: 'POST', url: '/api/invites/12/send', status: 500 }))
      .toBe('POST /api/invites/12/send → 500 (0ms, 42b)')
    expect(logLineFor({ method: 'DELETE', url: '/api/reset-tokens/7', status: 404 }))
      .toBe('DELETE /api/reset-tokens/7 → 404 (0ms, 42b)')
  })

  it('logs >= 400 at warn, other statuses at debug, and health checks at verbose', () => {
    logLineFor({ url: '/api/users', status: 404 })
    expect(warn).toHaveBeenCalledOnce()
    logLineFor({ url: '/api/users', status: 200 })
    expect(debug).toHaveBeenCalledOnce()
    logLineFor({ url: '/api/health?x=1', status: 500 })
    expect(verbose).toHaveBeenCalledOnce()
  })

  it('reports the elapsed time and a dash when content-length is missing', () => {
    expect(logLineFor({
      url: '/x',
      status: 200,
      contentLength: null,
      elapsedMs: 15,
    }))
      .toBe('GET /x → 200 (15ms, -b)')
  })
})
