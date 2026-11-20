/** A `true`/`false` env var, case-insensitive: blank means `fallback`, anything else throws naming `name`. */
export function parseBoolean(name: string, raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase()
  if (!value)
    return fallback
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  throw new Error(`${name}: "${raw}" must be "true" or "false"`)
}
