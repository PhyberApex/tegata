import type { IncomingMessage, ServerResponse } from 'node:http'
import helmet from 'helmet'
import { describe, expect, it } from 'vitest'
import { helmetOptions } from './helmet-options'

/** Runs the real helmet middleware against a stub response and returns the headers it set. */
function headersFor(nodeEnv: string | undefined): Map<string, string> {
  const headers = new Map<string, string>()
  const res = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), String(value)),
    removeHeader: (name: string) => headers.delete(name.toLowerCase()),
  } as unknown as ServerResponse
  const req = { headers: {} } as IncomingMessage
  let error: unknown
  helmet(helmetOptions(nodeEnv))(req, res, (err?: unknown) => {
    error = err
  })
  expect(error).toBeUndefined()
  return headers
}

describe('helmetOptions', () => {
  it('keeps upgrade-insecure-requests and HSTS under production', () => {
    const headers = headersFor('production')
    expect(headers.get('content-security-policy')).toContain('upgrade-insecure-requests')
    expect(headers.get('strict-transport-security')).toMatch(/max-age=\d+/)
  })

  it.each(['development', undefined])('drops upgrade-insecure-requests and HSTS when NODE_ENV is %s', (nodeEnv) => {
    const headers = headersFor(nodeEnv)
    const csp = headers.get('content-security-policy')
    expect(csp).not.toContain('upgrade-insecure-requests')
    expect(csp).toContain('default-src \'self\'')
    expect(csp).toContain('script-src \'self\'')
    expect(headers.has('strict-transport-security')).toBe(false)
  })
})
