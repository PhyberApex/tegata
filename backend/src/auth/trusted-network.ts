/**
 * The Break-Glass Fence: is this source address inside one of the trusted
 * networks?
 *
 * Pure, so the rule can be read and tested without a request. The networks
 * are IPv4 CIDRs; the default set is the three RFC1918 ranges plus loopback.
 * An IPv4-mapped IPv6 address is read as the IPv4 address it carries and
 * `::1` is always admitted; every other IPv6 address is refused — see
 * docs/adr/0004.
 */

/** `[network base, prefix length]` for one network the fence admits. */
export type Ipv4Network = readonly [number, number]

export const DEFAULT_TRUSTED_NETWORKS = '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8'

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV4_MAPPED_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i
const IPV4_MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i
/** Any spelling of `::1` — only zero groups and a trailing 1, with at least one colon. */
const IPV6_LOOPBACK = /^[0:]*1$/

/** An IPv4-mapped IPv6 address (either spelling) reduced to the IPv4 address it carries. */
function unwrapIpv4Mapped(address: string): string {
  const dotted = IPV4_MAPPED_DOTTED.exec(address)
  if (dotted)
    return dotted[1]

  const hex = IPV4_MAPPED_HEX.exec(address)
  if (!hex)
    return address

  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  return [
    high >> 8,
    high & 0xFF,
    low >> 8,
    low & 0xFF,
  ].join('.')
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
 * A comma-separated CIDR list as networks. An entry that isn't an IPv4 CIDR
 * is reported by name so a typo in `NATIVE_LOGIN_CIDRS` fails the boot
 * instead of silently widening or narrowing the fence.
 */
export function parseTrustedNetworks(value: string): Ipv4Network[] {
  const entries = value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)

  return entries.map((entry) => {
    const network = parseIpv4Network(entry)
    if (network === null)
      throw new Error(`NATIVE_LOGIN_CIDRS: "${entry}" is not an IPv4 address or CIDR`)
    return network
  })
}

function maskFor(prefix: number): number {
  return prefix === 0
    ? 0
    : (0xFFFFFFFF << (32 - prefix)) >>> 0
}

function isInside(address: number, networks: readonly Ipv4Network[]): boolean {
  return networks.some(([base, prefix]) => ((address ^ base) & maskFor(prefix)) === 0)
}

function isIpv6Loopback(address: string): boolean {
  return IPV6_LOOPBACK.test(address) && address.includes(':')
}

/**
 * True when `address` is inside the Break-Glass Fence — one of `networks`, in
 * either its IPv4 or IPv4-mapped IPv6 spelling, or IPv6 loopback. An address
 * that can't be read at all is outside the fence.
 */
export function isTrustedNetworkAddress(address: string | undefined, networks: readonly Ipv4Network[]): boolean {
  if (!address)
    return false

  const trimmed = address.trim()
  const v4 = toIpv4Number(unwrapIpv4Mapped(trimmed))
  if (v4 !== null)
    return isInside(v4, networks)

  return isIpv6Loopback(trimmed)
}
