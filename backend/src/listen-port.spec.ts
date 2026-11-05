import { describe, expect, it } from 'vitest'
import { parseListenPort } from './listen-port'

describe('parseListenPort', () => {
  it('parses a valid port', () => {
    expect(parseListenPort('4000')).toBe(4000)
    expect(parseListenPort('65535')).toBe(65535)
  })

  it('defaults to 3000 when missing or blank', () => {
    expect(parseListenPort(undefined)).toBe(3000)
    expect(parseListenPort('')).toBe(3000)
    expect(parseListenPort('  ')).toBe(3000)
  })

  it.each([
    'abc',
    '40x',
    '3.5',
    '-1',
    '0',
    '70000',
  ])('rejects %s', (raw) => {
    expect(() => parseListenPort(raw)).toThrow(/^PORT: /)
  })
})
