import { describe, expect, it } from 'vitest'
import { parseCommaList } from './parse-comma-list'

describe('parseCommaList', () => {
  it('splits on commas', () => {
    expect(parseCommaList('tegata,grimmory')).toEqual(['tegata', 'grimmory'])
  })

  it('trims whitespace around entries', () => {
    expect(parseCommaList(' tegata , grimmory ')).toEqual(['tegata', 'grimmory'])
  })

  it('drops empty entries', () => {
    expect(parseCommaList('tegata,,grimmory,')).toEqual(['tegata', 'grimmory'])
  })

  it('returns an empty array for an empty string', () => {
    expect(parseCommaList('')).toEqual([])
  })

  it('returns an empty array for a whitespace-only string', () => {
    expect(parseCommaList('   ')).toEqual([])
  })
})
