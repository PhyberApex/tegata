export const DEFAULT_PORT = 3000

export function parseListenPort(raw: string | undefined): number {
  const value = raw?.trim()
  if (!value)
    return DEFAULT_PORT
  const port = Number(value)
  if (!/^\d+$/.test(value) || port < 1 || port > 65535)
    throw new Error(`PORT: "${raw}" is not a port number between 1 and 65535`)
  return port
}
