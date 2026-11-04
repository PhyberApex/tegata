import { ConfigService } from '@nestjs/config'
import { describe, expect, it } from 'vitest'
import { NativeLoginFence } from './native-login-fence'

function fenceWith(cidrs: string | undefined): NativeLoginFence {
  const config = {
    get: (_key: string, fallback: string) => cidrs ?? fallback,
  } as unknown as ConfigService
  return new NativeLoginFence(config)
}

describe('nativeLoginFence', () => {
  it('admits the private networks and loopback when NATIVE_LOGIN_CIDRS is unset', () => {
    const fence = fenceWith(undefined)

    expect(fence.admits('192.168.1.42')).toBe(true)
    expect(fence.admits('10.8.0.2')).toBe(true)
    expect(fence.admits('127.0.0.1')).toBe(true)
    expect(fence.admits('203.0.113.5')).toBe(false)
  })

  it('admits only what NATIVE_LOGIN_CIDRS names', () => {
    const fence = fenceWith('192.168.1.0/24')

    expect(fence.admits('192.168.1.42')).toBe(true)
    expect(fence.admits('192.168.2.42')).toBe(false)
    expect(fence.admits('10.8.0.2')).toBe(false)
  })

  it('refuses to construct on an entry it cannot read, so the boot fails rather than the login', () => {
    expect(() => fenceWith('192.168.1.0/24,not-a-network')).toThrow('"not-a-network" is not an IPv4 address or CIDR')
  })
})
