import type { HashOptions } from 'argon2'
import process from 'node:process'
import { argon2id } from 'argon2'

const MIN_KIB_PER_LANE = 8
const HASH_LENGTH = 32
const DEFAULT_ARGON2_MEMORY_KIB = 65536
const DEFAULT_ARGON2_ITERATIONS = 3
const DEFAULT_ARGON2_PARALLELISM = 4

function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  const trimmed = value?.trim()
  if (!trimmed)
    return fallback
  const parsed = Number(trimmed)
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer, got "${trimmed}"`)
  return parsed
}

/**
 * Reads ARGON2_MEMORY_KIB, ARGON2_ITERATIONS and ARGON2_PARALLELISM into the options used for every newly
 * generated password hash. Unset or blank means the default; anything that is not a positive integer, or
 * memory below the 8 KiB per lane argon2 requires, throws so a typo refuses to boot.
 */
export function parseArgon2Options(get: (key: string) => string | undefined = key => process.env[key]): HashOptions {
  const memoryCost = parsePositiveInt('ARGON2_MEMORY_KIB', get('ARGON2_MEMORY_KIB'), DEFAULT_ARGON2_MEMORY_KIB)
  const timeCost = parsePositiveInt('ARGON2_ITERATIONS', get('ARGON2_ITERATIONS'), DEFAULT_ARGON2_ITERATIONS)
  const parallelism = parsePositiveInt('ARGON2_PARALLELISM', get('ARGON2_PARALLELISM'), DEFAULT_ARGON2_PARALLELISM)
  if (memoryCost < MIN_KIB_PER_LANE * parallelism)
    throw new Error(`ARGON2_MEMORY_KIB must be at least ${MIN_KIB_PER_LANE} times ARGON2_PARALLELISM (${MIN_KIB_PER_LANE * parallelism}), got ${memoryCost}`)
  return {
    type: argon2id,
    memoryCost,
    timeCost,
    parallelism,
    hashLength: HASH_LENGTH,
  }
}

/** Throws when an ARGON2_* variable is invalid, so a bad value refuses to boot. */
export function assertArgon2Options(): void {
  parseArgon2Options()
}
