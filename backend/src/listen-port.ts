export const DEFAULT_PORT = 3000

/** A TCP port from an env var: blank means `fallback`, anything but an integer 1-65535 throws naming `name`. */
export function parsePort(name: string, raw: string | undefined, fallback: number): number {
  const value = raw?.trim()
  if (!value)
    return fallback
  const port = Number(value)
  if (!/^\d+$/.test(value) || port < 1 || port > 65535)
    throw new Error(`${name}: "${raw}" is not a port number between 1 and 65535`)
  return port
}

export function parseListenPort(raw: string | undefined): number {
  return parsePort('PORT', raw, DEFAULT_PORT)
}
