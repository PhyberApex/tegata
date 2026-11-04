import type { ResetToken } from '../types'
import { describe, expect, it } from 'vitest'
import { outstandingResetTokenFor } from './resetTokens'

function makeToken(overrides: Partial<ResetToken> = {}): ResetToken {
  return {
    id: 'token-1',
    token: 'raw-token',
    username: 'alice',
    expires_at: '2026-01-02T00:00:00.000Z',
    used_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    email_sent_at: null,
    email_error: null,
    ...overrides,
  }
}

describe('outstandingResetTokenFor', () => {
  it('returns the unused token for the given username', () => {
    const token = makeToken()
    expect(outstandingResetTokenFor([token], 'alice')).toBe(token)
  })

  it('ignores tokens that have already been used', () => {
    const used = makeToken({ used_at: '2026-01-01T12:00:00.000Z' })
    expect(outstandingResetTokenFor([used], 'alice')).toBeNull()
  })

  it('ignores tokens belonging to other usernames', () => {
    const token = makeToken({ username: 'bob' })
    expect(outstandingResetTokenFor([token], 'alice')).toBeNull()
  })

  it('returns null when there is no matching token', () => {
    expect(outstandingResetTokenFor([], 'alice')).toBeNull()
  })
})
