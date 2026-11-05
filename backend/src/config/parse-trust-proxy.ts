/**
 * Reads TRUST_PROXY into what Express's `trust proxy` setting takes: a hop count, or a string of
 * IPs/CIDRs/keywords (`loopback`, `linklocal`, `uniquelocal`). Unset means one hop; anything that is
 * neither a non-negative integer nor a non-empty string throws, so a typo refuses to boot.
 */
export function parseTrustProxy(value: string | undefined): number | string {
  if (value === undefined)
    return 1
  const trimmed = value.trim()
  if (trimmed.length === 0)
    throw new Error('TRUST_PROXY must not be empty: use a hop count, IPs/CIDRs or loopback/linklocal/uniquelocal')
  if (/^-?\d+$/.test(trimmed)) {
    const hops = Number(trimmed)
    if (hops < 0 || !Number.isSafeInteger(hops))
      throw new Error(`TRUST_PROXY hop count must be a non-negative integer, got "${trimmed}"`)
    return hops
  }
  return trimmed
}
