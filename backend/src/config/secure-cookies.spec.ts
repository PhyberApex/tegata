import { describe, expect, it, vi } from 'vitest'
import { cookiesAreSecure, warnIfInsecureCookies } from './secure-cookies'

describe('warnIfInsecureCookies', () => {
  it('is silent when NODE_ENV is production', () => {
    const warn = vi.fn()
    warnIfInsecureCookies('production', warn)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once that cookies lack Secure when NODE_ENV is unset', () => {
    const warn = vi.fn()
    warnIfInsecureCookies(undefined, warn)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toMatch(/NODE_ENV is unset.*without the Secure flag/)
  })

  it('names the value when NODE_ENV is something other than production', () => {
    const warn = vi.fn()
    warnIfInsecureCookies('development', warn)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toMatch(/NODE_ENV is "development".*without the Secure flag/)
  })
})

describe('cookiesAreSecure', () => {
  it.each([
    ['production', true],
    [undefined, false],
    ['development', false],
  ])('nODE_ENV %s -> %s', (nodeEnv, secure) => {
    expect(cookiesAreSecure(nodeEnv)).toBe(secure)
  })
})
