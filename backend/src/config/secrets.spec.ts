import { argon2d, argon2i, hash } from 'argon2'
import { beforeAll, describe, expect, it } from 'vitest'
import { assertAdminPasswordHash, assertJwtSecret, assertSecrets } from './secrets'

const VALID_SECRET = 'a'.repeat(32)
const CHEAP = { memoryCost: 32, timeCost: 1, parallelism: 1 }

describe('assertJwtSecret', () => {
  it('rejects the .env.example placeholder', () => {
    expect(() => assertJwtSecret('change-me')).toThrow(/TEGATA_JWT_SECRET.*placeholder/)
  })

  it('rejects a secret shorter than 32 characters', () => {
    expect(() => assertJwtSecret('a'.repeat(31))).toThrow(/TEGATA_JWT_SECRET.*at least 32 characters/)
  })

  it('names the fix', () => {
    expect(() => assertJwtSecret('short')).toThrow(/openssl rand -hex 32/)
  })

  it('accepts a secret of 32 characters or more', () => {
    expect(() => assertJwtSecret(VALID_SECRET)).not.toThrow()
    expect(() => assertJwtSecret('0123456789abcdef'.repeat(4))).not.toThrow()
  })
})

describe('assertAdminPasswordHash', () => {
  let valid: string
  beforeAll(async () => {
    valid = await hash('pw', CHEAP)
  })

  it('rejects a hash whose $ were interpolated away by compose', async () => {
    // What `$argon2id$v=19$m=65536,t=3,p=4$...` becomes in an `environment:` list without doubling
    await expect(assertAdminPasswordHash('=19=65536,t=3,p=4')).rejects.toThrow(/TEGATA_ADMIN_PASSWORD_HASH.*\$\$/s)
  })

  it('hints that compose interpolated the $ signs when the value does not start with $argon2', async () => {
    await expect(assertAdminPasswordHash('=19=65536,t=3,p=4')).rejects.toThrow(/does not start with `\$argon2`.*Compose interpolated/s)
  })

  it('does not add the interpolation hint when the value starts with $argon2', async () => {
    await expect(assertAdminPasswordHash('$argon2x$v=19$m=32,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g')).rejects.not.toThrow(/interpolated/)
  })

  it.each([
    ['an argon2 prefix mismatch', '$2b$10$abcdefghijklmnopqrstuuJ2bY0q3M7W4pQwIYbz2mOq3U8oVQ6xS'],
    ['an unparseable argon2 hash', '$argon2id$v=19$m=65536,t=3,p=4$...'],
  ])('names the quoting rule for env_file and environment: on %s', async (_, value) => {
    const error = await assertAdminPasswordHash(value).then(() => undefined, (e: Error) => e)
    expect(error?.message).toMatch(/`env_file:`.*single quotes/s)
    expect(error?.message).toMatch(/`environment:`.*doubled/s)
    expect(error?.message).not.toMatch(/literally/)
  })

  it.each([
    '$2b$10$abcdefghijklmnopqrstuuJ2bY0q3M7W4pQwIYbz2mOq3U8oVQ6xS',
    '$scrypt$ln=16,r=8,p=1$c2FsdA$aGFzaA',
    '$argon2x$v=19$m=32,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g',
  ])('rejects a PHC string that is not argon2: %s', async (value) => {
    await expect(assertAdminPasswordHash(value)).rejects.toThrow(/TEGATA_ADMIN_PASSWORD_HASH.*argon2/s)
  })

  it.each([
    ['the .env.example placeholder', '$argon2id$v=19$m=65536,t=3,p=4$...'],
    ['a missing digest', '$argon2id$v=19$m=32,t=1,p=1$c2FsdHNhbHQ'],
    ['a missing parameter', '$argon2id$v=19$m=32,t=1$c2FsdHNhbHQ$aGFzaGhhc2g'],
    ['malformed parameters', '$argon2id$v=19m=32,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g'],
  ])('rejects an argon2 hash argon2 cannot parse: %s', async (_, value) => {
    await expect(assertAdminPasswordHash(value)).rejects.toThrow(/TEGATA_ADMIN_PASSWORD_HASH.*cannot be parsed/s)
  })

  it('accepts a real argon2id hash, and argon2i/argon2d ones', async () => {
    await expect(assertAdminPasswordHash(valid)).resolves.toBeUndefined()
    await expect(assertAdminPasswordHash(await hash('pw', { ...CHEAP, type: argon2i }))).resolves.toBeUndefined()
    await expect(assertAdminPasswordHash(await hash('pw', { ...CHEAP, type: argon2d }))).resolves.toBeUndefined()
  })

  it('checks the value exactly as login will use it, so stray whitespace is refused', async () => {
    await expect(assertAdminPasswordHash(`${valid}\n`)).rejects.toThrow(/TEGATA_ADMIN_PASSWORD_HASH/)
  })
})

describe('assertSecrets', () => {
  it('passes a valid pair', async () => {
    const env: Record<string, string> = {
      TEGATA_JWT_SECRET: VALID_SECRET,
      TEGATA_ADMIN_PASSWORD_HASH: await hash('pw', CHEAP),
    }
    await expect(assertSecrets(key => env[key])).resolves.toBeUndefined()
  })

  it('refuses a missing value, naming it', async () => {
    await expect(assertSecrets(() => undefined)).rejects.toThrow(/TEGATA_JWT_SECRET is not set/)
    const blankHash: Record<string, string> = { TEGATA_JWT_SECRET: VALID_SECRET, TEGATA_ADMIN_PASSWORD_HASH: ' ' }
    await expect(assertSecrets(key => blankHash[key])).rejects.toThrow(/TEGATA_ADMIN_PASSWORD_HASH is not set/)
  })
})
