import { describe, expect, it } from 'vitest'
import { DEFAULT_TRUSTED_NETWORKS, isTrustedNetworkAddress, parseIpv4Network, parseIpv6Network, parseTrustedNetworks } from './trusted-network'

const DEFAULTS = parseTrustedNetworks(DEFAULT_TRUSTED_NETWORKS)
const admitted = (address: string | undefined) => isTrustedNetworkAddress(address, DEFAULTS)

describe('isTrustedNetworkAddress', () => {
  describe('the three private IPv4 networks in the default list', () => {
    it.each([
      ['10.0.0.0'],
      ['10.1.2.3'],
      ['10.255.255.255'],
    ])('admits %s from 10.0.0.0/8', (address) => {
      expect(admitted(address)).toBe(true)
    })

    it.each([
      ['172.16.0.0'],
      ['172.20.10.5'],
      ['172.31.255.255'],
    ])('admits %s from 172.16.0.0/12', (address) => {
      expect(admitted(address)).toBe(true)
    })

    it.each([
      ['172.15.255.255'],
      ['172.32.0.0'],
    ])('refuses %s, just outside 172.16.0.0/12', (address) => {
      expect(admitted(address)).toBe(false)
    })

    it.each([
      ['192.168.0.0'],
      ['192.168.1.42'],
      ['192.168.255.255'],
    ])('admits %s from 192.168.0.0/16', (address) => {
      expect(admitted(address)).toBe(true)
    })

    it('refuses 192.167.255.255 and 192.169.0.0, just outside 192.168.0.0/16', () => {
      expect(admitted('192.167.255.255')).toBe(false)
      expect(admitted('192.169.0.0')).toBe(false)
    })

    it('refuses 9.255.255.255 and 11.0.0.0, just outside 10.0.0.0/8', () => {
      expect(admitted('9.255.255.255')).toBe(false)
      expect(admitted('11.0.0.0')).toBe(false)
    })
  })

  describe('loopback', () => {
    it.each([
      ['127.0.0.1'],
      ['127.1.2.3'],
      ['::1'],
      ['0:0:0:0:0:0:0:1'],
      ['0::1'],
      ['::0:1'],
    ])('admits %s', (address) => {
      expect(admitted(address)).toBe(true)
    })

    it('admits ::1 even when the list names no loopback network', () => {
      expect(isTrustedNetworkAddress('::1', parseTrustedNetworks('10.0.0.0/8'))).toBe(true)
    })

    it('refuses a bare "1", which carries no colon and is no address at all', () => {
      expect(admitted('1')).toBe(false)
    })
  })

  describe('iPv4-mapped IPv6', () => {
    it('reads ::ffff:192.168.1.42 as the IPv4 address it carries', () => {
      expect(admitted('::ffff:192.168.1.42')).toBe(true)
    })

    it('reads ::ffff:127.0.0.1 as loopback', () => {
      expect(admitted('::ffff:127.0.0.1')).toBe(true)
    })

    it('refuses ::ffff:203.0.113.5, a mapped public address', () => {
      expect(admitted('::ffff:203.0.113.5')).toBe(false)
    })

    it('reads the hex form ::ffff:c0a8:012a as 192.168.1.42', () => {
      expect(admitted('::ffff:c0a8:012a')).toBe(true)
    })
  })

  describe('everything else', () => {
    it.each([
      ['203.0.113.5'],
      ['8.8.8.8'],
      ['1.1.1.1'],
      ['0.0.0.0'],
      ['255.255.255.255'],
    ])('refuses the IPv4 address %s', (address) => {
      expect(admitted(address)).toBe(false)
    })

    it.each([
      ['2001:db8::1'],
      ['2a02:8109:abcd::42'],
      ['fd00::1'],
      ['fe80::1'],
    ])('refuses the IPv6 address %s', (address) => {
      expect(admitted(address)).toBe(false)
    })

    it.each([
      [undefined],
      [''],
      ['not-an-address'],
      ['192.168.1'],
      ['192.168.1.256'],
      ['192.168.1.1.1'],
      ['192.168.01.1'],
    ])('refuses the unreadable address %s', (address) => {
      expect(admitted(address)).toBe(false)
    })
  })

  describe('a configured list', () => {
    const narrow = parseTrustedNetworks('192.168.1.0/24, 100.64.0.0/10')

    it('admits only what the list names', () => {
      expect(isTrustedNetworkAddress('192.168.1.42', narrow)).toBe(true)
      expect(isTrustedNetworkAddress('100.100.1.1', narrow)).toBe(true)
      expect(isTrustedNetworkAddress('192.168.2.1', narrow)).toBe(false)
      expect(isTrustedNetworkAddress('10.0.0.1', narrow)).toBe(false)
      expect(isTrustedNetworkAddress('127.0.0.1', narrow)).toBe(false)
    })

    it('admits nobody but ::1 on an empty list', () => {
      expect(isTrustedNetworkAddress('192.168.1.42', [])).toBe(false)
      expect(isTrustedNetworkAddress('::1', [])).toBe(true)
    })
  })
})

describe('parseIpv4Network', () => {
  it('reads a CIDR, masking host bits off', () => {
    expect(parseIpv4Network('192.168.1.42/24')).toEqual([0xC0A80100, 24])
  })

  it('reads a bare address as a /32', () => {
    expect(parseIpv4Network('203.0.113.5')).toEqual([0xCB007105, 32])
  })

  it('reads /0 as everything', () => {
    expect(parseIpv4Network('0.0.0.0/0')).toEqual([0, 0])
    expect(isTrustedNetworkAddress('8.8.8.8', [
      [0, 0],
    ])).toBe(true)
  })

  it.each([
    ['192.168.1.0/33'],
    ['192.168.1.0/-1'],
    ['192.168.1.0/x'],
    ['192.168.1.0/24/8'],
    ['192.168.1/24'],
    ['192.168.01.0/24'],
    ['fd00::/8'],
    [''],
  ])('refuses %s', (entry) => {
    expect(parseIpv4Network(entry)).toBeNull()
  })
})

describe('parseTrustedNetworks', () => {
  it('reads the default list', () => {
    expect(DEFAULTS).toEqual([
      [0x0A000000, 8],
      [0xAC100000, 12],
      [0xC0A80000, 16],
      [0x7F000000, 8],
    ])
  })

  it('trims entries and drops empty ones', () => {
    expect(parseTrustedNetworks(' 10.0.0.0/8 ,, 192.168.0.0/16, ')).toEqual([
      [0x0A000000, 8],
      [0xC0A80000, 16],
    ])
  })

  it('returns an empty list for an empty string', () => {
    expect(parseTrustedNetworks('')).toEqual([])
  })

  it('names the entry it cannot read', () => {
    expect(() => parseTrustedNetworks('10.0.0.0/8,fd00::/129')).toThrow('"fd00::/129" is not an IPv4 or IPv6 address or CIDR')
  })

  it.each([
    ['fd00::/8:'],
    ['fd00:::1/8'],
    ['1:2:3:4:5:6:7:8:9'],
    ['fd00::/x'],
    ['gggg::/16'],
    ['fe80::1%eth0/10'],
  ])('fails the boot on malformed IPv6 entry %s', (entry) => {
    expect(() => parseTrustedNetworks(`10.0.0.0/8,${entry}`)).toThrow(`"${entry}"`)
  })
})

describe('parseIpv6Network', () => {
  it('reads a CIDR, masking host bits off', () => {
    expect(parseIpv6Network('fd12:3456::1/8')).toEqual([0xFD00n << 112n, 8])
  })

  it('reads a bare address as a /128', () => {
    expect(parseIpv6Network('2001:db8::1')).toEqual([(0x20010DB8n << 96n) | 1n, 128])
  })

  it('refuses an IPv4 entry', () => {
    expect(parseIpv6Network('10.0.0.0/8')).toBeNull()
  })
})

describe('ipv6 networks', () => {
  const mixed = parseTrustedNetworks('192.168.0.0/16,fd00::/8')

  it('admits fd12:3456::1 and 192.168.1.5, refuses 2a00::1', () => {
    expect(isTrustedNetworkAddress('fd12:3456::1', mixed)).toBe(true)
    expect(isTrustedNetworkAddress('192.168.1.5', mixed)).toBe(true)
    expect(isTrustedNetworkAddress('2a00::1', mixed)).toBe(false)
  })

  it('strips a zone id before matching', () => {
    const linkLocal = parseTrustedNetworks('fe80::/10')
    expect(isTrustedNetworkAddress('fe80::1%eth0', linkLocal)).toBe(true)
    expect(isTrustedNetworkAddress('fe80::1%', linkLocal)).toBe(false)
  })

  it('matches full-form and dotted-tail spellings', () => {
    const doc = parseTrustedNetworks('2001:db8::/32')
    expect(isTrustedNetworkAddress('2001:0db8:0000:0000:0000:0000:0000:0001', doc)).toBe(true)
    expect(isTrustedNetworkAddress('2001:db9::1', doc)).toBe(false)
    expect(isTrustedNetworkAddress('::ffff:10.0.0.1', doc)).toBe(false)
  })

  it('does not let an IPv6 network admit IPv4 or the reverse', () => {
    expect(isTrustedNetworkAddress('0.0.0.1', parseTrustedNetworks('::/0'))).toBe(false)
    expect(isTrustedNetworkAddress('fd00::1', parseTrustedNetworks('0.0.0.0/0'))).toBe(false)
  })

  it('matches a bare /128 exactly', () => {
    const one = parseTrustedNetworks('fd00::5')
    expect(isTrustedNetworkAddress('fd00::5', one)).toBe(true)
    expect(isTrustedNetworkAddress('fd00::6', one)).toBe(false)
  })

  it('still unwraps IPv4-mapped addresses against IPv4 networks', () => {
    expect(isTrustedNetworkAddress('::ffff:192.168.1.5', mixed)).toBe(true)
  })

  it.each([
    ['fd00::1::2'],
    ['fd00:1'],
    ['1:2:3:4:5:6:7:8:9'],
  ])('refuses unreadable %s', (a) => {
    expect(isTrustedNetworkAddress(a, mixed)).toBe(false)
  })
})
