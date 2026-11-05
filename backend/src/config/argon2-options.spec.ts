import { hash, verify } from 'argon2'
import { describe, expect, it } from 'vitest'
import { parseArgon2Options } from './argon2-options'

const from = (env: Record<string, string>) => parseArgon2Options(key => env[key])

describe('parseArgon2Options', () => {
  it('defaults to 64 MiB, 3 iterations, 4 lanes', () => {
    expect(from({})).toMatchObject({
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      hashLength: 32,
    })
  })

  it('treats blank values as unset', () => {
    expect(from({ ARGON2_MEMORY_KIB: ' ' })).toMatchObject({ memoryCost: 65536 })
  })

  it('reads overrides', () => {
    expect(from({ ARGON2_MEMORY_KIB: '19456', ARGON2_ITERATIONS: '2', ARGON2_PARALLELISM: '1' }))
      .toMatchObject({ memoryCost: 19456, timeCost: 2, parallelism: 1 })
  })

  it.each(['abc', '0', '-1', '1.5', '1e3'])('rejects %s', (value) => {
    expect(() => from({ ARGON2_ITERATIONS: value })).toThrow(/ARGON2_ITERATIONS/)
    expect(() => from({ ARGON2_MEMORY_KIB: value })).toThrow(/ARGON2_MEMORY_KIB/)
    expect(() => from({ ARGON2_PARALLELISM: value })).toThrow(/ARGON2_PARALLELISM/)
  })

  it('requires memory of at least 8 KiB per lane', () => {
    expect(() => from({ ARGON2_MEMORY_KIB: '31' })).toThrow(/at least 8 times/)
    expect(from({ ARGON2_MEMORY_KIB: '32' })).toMatchObject({ memoryCost: 32 })
  })

  it('produces hashes carrying the configured parameters, and old hashes still verify', async () => {
    const old = await hash('pw', from({}))
    const tuned = await hash('pw', from({ ARGON2_MEMORY_KIB: '19456', ARGON2_ITERATIONS: '2', ARGON2_PARALLELISM: '1' }))

    expect(tuned).toMatch(/\$m=19456,(t=2,p=1|p=1,t=2)\$/)
    expect(await verify(old, 'pw')).toBe(true)
    expect(await verify(tuned, 'pw')).toBe(true)
  })
})
