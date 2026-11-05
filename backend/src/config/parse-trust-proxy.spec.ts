import { createServer } from 'node:http'
import { ExpressAdapter } from '@nestjs/platform-express'
import { describe, expect, it } from 'vitest'
import { parseTrustProxy } from './parse-trust-proxy'

async function clientIp(trustProxy: number | string, forwardedFor: string): Promise<string> {
  const app = new ExpressAdapter().getInstance()
  app.set('trust proxy', trustProxy)
  app.get('/', (req: { ip?: string }, res: { send: (body?: string) => void }) => {
    res.send(req.ip)
  })
  const server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { 'X-Forwarded-For': forwardedFor },
    })
    return await res.text()
  }
  finally {
    server.close()
  }
}

describe('parseTrustProxy', () => {
  it('defaults to one hop when unset', () => {
    expect(parseTrustProxy(undefined)).toBe(1)
  })

  it('reads a hop count as a number', () => {
    expect(parseTrustProxy('2')).toBe(2)
    expect(parseTrustProxy(' 0 ')).toBe(0)
  })

  it('passes CIDR lists and keywords through', () => {
    expect(parseTrustProxy('10.0.0.0/8,172.16.0.0/12')).toBe('10.0.0.0/8,172.16.0.0/12')
    expect(parseTrustProxy('loopback')).toBe('loopback')
  })

  it('refuses an empty value', () => {
    expect(() => parseTrustProxy('')).toThrow(/TRUST_PROXY/)
    expect(() => parseTrustProxy('  ')).toThrow(/TRUST_PROXY/)
  })

  it('refuses a negative hop count', () => {
    expect(() => parseTrustProxy('-1')).toThrow(/TRUST_PROXY/)
  })

  describe('in Express', () => {
    // Caller 203.0.113.9 -> outer proxy 198.51.100.7 -> inner proxy (socket, 127.0.0.1)
    const chain = '203.0.113.9, 198.51.100.7'

    it('one hop resolves to the outer proxy', async () => {
      expect(await clientIp(parseTrustProxy('1'), chain)).toBe('198.51.100.7')
    })

    it('two hops resolve to the real client', async () => {
      expect(await clientIp(parseTrustProxy('2'), chain)).toBe('203.0.113.9')
    })

    it('a CIDR list trusts the proxies inside it', async () => {
      expect(await clientIp(parseTrustProxy('127.0.0.0/8,198.51.100.0/24'), chain)).toBe('203.0.113.9')
    })
  })
})
