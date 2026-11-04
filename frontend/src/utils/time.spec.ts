import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { timeUntilExpiry } from './time'

describe('timeUntilExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports days and hours when more than a day remains', () => {
    expect(timeUntilExpiry('2026-01-03T06:00:00.000Z')).toBe('2d 6h')
  })

  it('reports only hours when less than a day remains', () => {
    expect(timeUntilExpiry('2026-01-01T05:00:00.000Z')).toBe('5h')
  })

  it('reports minutes in the last hour instead of 0h', () => {
    expect(timeUntilExpiry('2026-01-01T00:42:00.000Z')).toBe('42m')
  })

  it('reports <1m in the last minute instead of Expired', () => {
    expect(timeUntilExpiry('2026-01-01T00:00:30.000Z')).toBe('<1m')
  })

  it('reports Expired once the timestamp has passed', () => {
    expect(timeUntilExpiry('2025-12-31T00:00:00.000Z')).toBe('Expired')
  })

  it('reports Expired exactly at the timestamp', () => {
    expect(timeUntilExpiry('2026-01-01T00:00:00.000Z')).toBe('Expired')
  })
})
