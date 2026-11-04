/** Trims each entry, drops empty ones. Shared by every env var that takes a comma-separated list of names. */
export function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}
