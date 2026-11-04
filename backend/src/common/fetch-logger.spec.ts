import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFetchLogger } from './fetch-logger'

describe('installFetchLogger', () => {
  const originalFetch = globalThis.fetch
  let inner: ReturnType<typeof vi.fn>
  let verbose: ReturnType<typeof vi.spyOn>
  let debug: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    inner = vi.fn(async () => new Response('ok', {
      status: 200,
      headers: { 'content-length': '2' },
    }))
    globalThis.fetch = inner as unknown as typeof fetch
    verbose = vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {})
    debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('passes the call through to the fetch it wrapped', async () => {
    installFetchLogger()
    const init = { method: 'post' }

    const res = await fetch('http://svc/api/thing', init)

    expect(res.status).toBe(200)
    expect(inner).toHaveBeenCalledWith('http://svc/api/thing', init)
    expect(debug).toHaveBeenCalledWith('→ POST http://svc/api/thing')
  })

  it('logs a URL matching one of the service\'s verbose patterns at verbose, not debug', async () => {
    installFetchLogger({
      verbosePatterns: ['/status'],
    })

    await fetch('http://svc/api/status')

    expect(verbose).toHaveBeenCalledWith('→ GET http://svc/api/status')
    expect(verbose).toHaveBeenCalledWith(expect.stringMatching(/^← GET http:\/\/svc\/api\/status 200 \(\d+ms, 2b\)$/))
    expect(debug).not.toHaveBeenCalled()
  })

  it('treats a URL as ordinary when the service named no pattern it matches', async () => {
    installFetchLogger({
      verbosePatterns: ['/health'],
    })

    await fetch(new URL('http://svc/api/status'))

    expect(verbose).not.toHaveBeenCalled()
    expect(debug).toHaveBeenCalledWith('→ GET http://svc/api/status')
  })

  it('warns on a non-2xx answer to an ordinary URL', async () => {
    inner.mockResolvedValueOnce(new Response('', { status: 503 }))
    installFetchLogger()

    await fetch(new Request('http://svc/api/thing'))

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^← GET http:\/\/svc\/api\/thing 503 \(\d+ms, \?b\)$/))
  })

  it('warns and rethrows when the request itself fails', async () => {
    inner.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    installFetchLogger()

    await expect(fetch('http://svc/api/thing')).rejects.toThrow('ECONNREFUSED')
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/FAILED \(\d+ms\): ECONNREFUSED$/))
  })
})
