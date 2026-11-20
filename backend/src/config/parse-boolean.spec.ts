import { describe, expect, it } from 'vitest'
import { parseBoolean } from './parse-boolean'

describe('parseBoolean', () => {
  it('parses true and false case-insensitively, ignoring surrounding whitespace', () => {
    expect(parseBoolean('X', 'true', false)).toBe(true)
    expect(parseBoolean('X', ' TRUE ', false)).toBe(true)
    expect(parseBoolean('X', 'False', true)).toBe(false)
  })

  it('falls back when missing or blank', () => {
    expect(parseBoolean('X', undefined, true)).toBe(true)
    expect(parseBoolean('X', '  ', false)).toBe(false)
  })

  it.each(['yes', '1', 'on'])('rejects %s, naming the variable', (raw) => {
    expect(() => parseBoolean('SMTP_SECURE', raw, false)).toThrow(/^SMTP_SECURE: /)
  })
})
