import process from 'node:process'
import { verify } from 'argon2'

const MIN_JWT_SECRET_LENGTH = 32
const PLACEHOLDER_JWT_SECRET = 'change-me'
const ARGON2_FAMILY = '$argon2'
const ARGON2_PREFIX = /^\$argon2(?:id|i|d)\$/
const JWT_SECRET_FIX = 'generate one with: openssl rand -hex 32'
const COMPOSE_QUOTING_RULE = 'Compose interpolates `$` in both places: in an `env_file:` wrap the hash in single quotes (or double every `$`); in a compose `environment:` list every `$` has to be doubled (`$$`).'
const INTERPOLATED_HINT = 'The value does not start with `$argon2`, which usually means Compose interpolated its `$` signs.'

/**
 * Throws unless TEGATA_JWT_SECRET is a real secret: not the `.env.example` placeholder and at least
 * 32 characters, so a forgotten or guessable key (anyone holding it can mint an admin session)
 * refuses to boot.
 */
export function assertJwtSecret(secret: string): void {
  if (secret === PLACEHOLDER_JWT_SECRET)
    throw new Error(`TEGATA_JWT_SECRET is still the "${PLACEHOLDER_JWT_SECRET}" placeholder from .env.example; ${JWT_SECRET_FIX}`)
  if (secret.length < MIN_JWT_SECRET_LENGTH)
    throw new Error(`TEGATA_JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters, got ${secret.length}; ${JWT_SECRET_FIX}`)
}

/**
 * Throws unless TEGATA_ADMIN_PASSWORD_HASH is an argon2 PHC string argon2 can verify against, so a
 * mangled hash refuses to boot instead of turning Native Login into a 500 the moment it is needed.
 * Runs one verification with the hash's own parameters to prove it parses.
 */
export async function assertAdminPasswordHash(passwordHash: string): Promise<void> {
  if (!ARGON2_PREFIX.test(passwordHash)) {
    const hint = passwordHash.startsWith(ARGON2_FAMILY)
      ? ''
      : ` ${INTERPOLATED_HINT}`
    throw new Error(
      `TEGATA_ADMIN_PASSWORD_HASH must be an argon2 hash starting with $argon2id$, $argon2i$ or $argon2d$.${hint} ${COMPOSE_QUOTING_RULE}`,
    )
  }
  try {
    await verify(passwordHash, '')
  }
  catch (error) {
    const reason = (error as Error).message
    throw new Error(
      `TEGATA_ADMIN_PASSWORD_HASH cannot be parsed by argon2 (${reason}). Generate a fresh one with: authelia crypto hash generate argon2. ${COMPOSE_QUOTING_RULE}`,
    )
  }
}

function required(get: (key: string) => string | undefined, key: string): string {
  const value = get(key)
  if (!value?.trim())
    throw new Error(`${key} is not set`)
  return value
}

/** Throws when TEGATA_JWT_SECRET or TEGATA_ADMIN_PASSWORD_HASH is missing or unusable, so a bad secret refuses to boot. */
export async function assertSecrets(get: (key: string) => string | undefined = key => process.env[key]): Promise<void> {
  assertJwtSecret(required(get, 'TEGATA_JWT_SECRET'))
  await assertAdminPasswordHash(required(get, 'TEGATA_ADMIN_PASSWORD_HASH'))
}
