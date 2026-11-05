/**
 * The Break-Glass Fence: is this source address inside one of the trusted
 * networks?
 *
 * Pure, so the rule can be read and tested without a request. The networks
 * are IPv4 or IPv6 CIDRs; the default set is the three RFC1918 ranges plus
 * loopback. An IPv4-mapped IPv6 address is read as the IPv4 address it
 * carries, a zone id (`fe80::1%eth0`) is ignored, and `::1` is always
 * admitted — see docs/adr/0004 and docs/adr/0005.
 */

/** `[network base, prefix length]` for one IPv4 network the fence admits. */
export type Ipv4Network = readonly [number, number]
/** `[network base, prefix length]` for one IPv6 network the fence admits. */
export type Ipv6Network = readonly [bigint, number]
export type TrustedNetwork = Ipv4Network | Ipv6Network

export const DEFAULT_TRUSTED_NETWORKS = '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8'

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV6_GROUP = /^[0-9a-f]{1,4}$/i
const IPV6_BITS = 128
const IPV6_LOOPBACK = 1n
/** The `::ffff:0:0/96` prefix that marks an IPv4-mapped address. */
const IPV4_MAPPED_PREFIX = 0xFFFFn

/** An IPv6 address as a 128-bit number, or `null` if it isn't one. A zone id is ignored. */
function toIpv6Number(address: string): bigint | null {
  const zoneAt = address.indexOf('%')
  const text = zoneAt === -1
    ? address
    : address.slice(0, zoneAt)
  if (zoneAt !== -1 && zoneAt === address.length - 1)
    return null

  // A dotted-quad tail stands for the last two groups.
  const lastColon = text.lastIndexOf(':')
  let body = text
  if (lastColon !== -1 && text.includes('.', lastColon)) {
    const v4 = toIpv4Number(text.slice(lastColon + 1))
    if (v4 === null)
      return null
    body = `${text.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xFFFF).toString(16)}`
  }

  const halves = body.split('::')
  if (halves.length > 2 || !body.includes(':'))
    return null
  const split = (half: string | undefined): string[] => half
    ? half.split(':')
    : []
  const head = split(halves[0])
  const tail = split(halves[1])
  const compressed = halves.length === 2
  const given = head.length + tail.length
  if (compressed && given > 7)
    return null
  if (!compressed && given !== 8)
    return null

  const zeros: string[] = compressed
    ? '0'.repeat(8 - given).split('')
    : []
  const groups = [
    ...head,
    ...zeros,
    ...tail,
  ]
  if (!groups.every(g => IPV6_GROUP.test(g)))
    return null
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(Number.parseInt(g, 16)), 0n)
}

/** A dotted-quad IPv4 address as a 32-bit number, or `null` if it isn't one. */
function toIpv4Number(address: string): number | null {
  const match = IPV4.exec(address)
  if (!match)
    return null

  // `String(Number(p))` round-trips only without leading zeros, which would
  // otherwise read as octal somewhere downstream.
  const parts = match.slice(1)
  const wellFormed = parts.every(p => p === String(Number(p)) && Number(p) <= 255)
  return wellFormed
    ? parts.reduce((acc, p) => acc * 256 + Number(p), 0)
    : null
}

/**
 * One `a.b.c.d/n` entry as a network, or `null` when it isn't one. A bare
 * address is a /32. Host bits set below the prefix are masked off rather
 * than refused, so `192.168.1.42/24` means `192.168.1.0/24`.
 */
export function parseIpv4Network(entry: string): Ipv4Network | null {
  const [addressPart, prefixPart, ...rest] = entry.trim().split('/')
  if (rest.length > 0)
    return null

  const address = toIpv4Number(addressPart)
  if (address === null)
    return null

  const prefix = prefixPart === undefined
    ? 32
    : Number(prefixPart)
  if (prefixPart !== undefined && (prefixPart !== String(prefix) || prefix < 0 || prefix > 32))
    return null

  return [(address & maskFor(prefix)) >>> 0, prefix]
}

/**
 * One `addr/n` IPv6 entry as a network, or `null` when it isn't one. A bare
 * address is a /128. Host bits below the prefix are masked off.
 */
export function parseIpv6Network(entry: string): Ipv6Network | null {
  const [addressPart, prefixPart, ...rest] = entry.trim().split('/')
  if (rest.length > 0 || addressPart.includes('%'))
    return null

  const address = toIpv6Number(addressPart)
  if (address === null)
    return null

  const prefix = prefixPart === undefined
    ? IPV6_BITS
    : Number(prefixPart)
  if (prefixPart !== undefined && (prefixPart !== String(prefix) || prefix < 0 || prefix > IPV6_BITS))
    return null

  // A mapped source is matched as IPv4, so a network inside ::ffff:0:0/96 could never match.
  if (prefix >= 96 && address >> 32n === IPV4_MAPPED_PREFIX)
    return null

  return [address & maskFor6(prefix), prefix]
}

/**
 * A comma-separated CIDR list as networks. An entry that isn't an IPv4 or
 * IPv6 CIDR is reported by name so a typo in `NATIVE_LOGIN_CIDRS` fails the
 * boot instead of silently widening or narrowing the fence.
 */
export function parseTrustedNetworks(value: string): TrustedNetwork[] {
  const entries = value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)

  return entries.map((entry) => {
    const network = parseIpv4Network(entry) ?? parseIpv6Network(entry)
    if (network === null)
      throw new Error(`NATIVE_LOGIN_CIDRS: "${entry}" is not an IPv4 or IPv6 address or CIDR`)
    return network
  })
}

function maskFor(prefix: number): number {
  return prefix === 0
    ? 0
    : (0xFFFFFFFF << (32 - prefix)) >>> 0
}

function maskFor6(prefix: number): bigint {
  return ((1n << BigInt(prefix)) - 1n) << BigInt(IPV6_BITS - prefix)
}

function isInside4(address: number, networks: readonly TrustedNetwork[]): boolean {
  return networks.some(([base, prefix]) =>
    typeof base === 'number' && ((address ^ base) & maskFor(prefix)) === 0)
}

function isInside6(address: bigint, networks: readonly TrustedNetwork[]): boolean {
  return networks.some(([base, prefix]) =>
    typeof base === 'bigint' && ((address ^ base) & maskFor6(prefix)) === 0n)
}

/**
 * True when `address` is inside the Break-Glass Fence — one of `networks`, in
 * either its IPv4 or IPv4-mapped IPv6 spelling, or IPv6 loopback. An address
 * that can't be read at all is outside the fence.
 */
export function isTrustedNetworkAddress(address: string | undefined, networks: readonly TrustedNetwork[]): boolean {
  if (!address)
    return false

  const trimmed = address.trim()
  const v4 = toIpv4Number(trimmed)
  if (v4 !== null)
    return isInside4(v4, networks)

  const v6 = toIpv6Number(trimmed)
  if (v6 === null)
    return false
  if (v6 === IPV6_LOOPBACK)
    return true
  if (v6 >> 32n === IPV4_MAPPED_PREFIX)
    return isInside4(Number(v6 & 0xFFFFFFFFn), networks)
  return isInside6(v6, networks)
}
