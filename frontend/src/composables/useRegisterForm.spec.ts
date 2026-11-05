import type { RegisterFormFields } from './useRegisterForm'
import { DEFAULT_USERNAME_PATTERN } from '@tegata/shared'
import { describe, expect, it } from 'vitest'
import { inviteFieldsPatch, passwordMatchError, usernameError, usernamePattern } from './useRegisterForm'

function form(overrides: Partial<RegisterFormFields> = {}): RegisterFormFields {
  return {
    username: '',
    displayname: '',
    email: '',
    password: '',
    confirmPassword: '',
    ...overrides,
  }
}

describe('passwordMatchError', () => {
  it('returns an error when the passwords do not match', () => {
    expect(passwordMatchError(form({ password: 'hunter2', confirmPassword: 'hunter3' }))).toBe('Passwords do not match')
  })

  it('returns an empty string when the passwords match', () => {
    expect(passwordMatchError(form({ password: 'hunter2', confirmPassword: 'hunter2' }))).toBe('')
  })
})

describe('inviteFieldsPatch', () => {
  it('locks and fills displayname when the invite supplies one', () => {
    const patch = inviteFieldsPatch(form(), { valid: true, displayname: 'Ada Lovelace' })
    expect(patch).toEqual({
      displayname: 'Ada Lovelace',
      email: '',
      lockedDisplayname: true,
      lockedEmail: false,
    })
  })

  it('locks and fills email when the invite supplies one', () => {
    const patch = inviteFieldsPatch(form(), { valid: true, email: 'ada@example.com' })
    expect(patch).toEqual({
      displayname: '',
      email: 'ada@example.com',
      lockedDisplayname: false,
      lockedEmail: true,
    })
  })

  it('leaves both fields unlocked and carries the current values through when the invite supplies neither', () => {
    const patch = inviteFieldsPatch(form({ displayname: 'kept', email: 'kept@example.com' }), { valid: true })
    expect(patch).toEqual({
      displayname: 'kept',
      email: 'kept@example.com',
      lockedDisplayname: false,
      lockedEmail: false,
    })
  })
})

describe('usernameError', () => {
  it.each(['john doe', 'John', 'a/b'])('rejects %j with a message naming the rule', (username) => {
    expect(usernameError(username)).toContain('lowercase letters, digits')
  })

  it('accepts john.doe-2', () => {
    expect(usernameError('john.doe-2')).toBe('')
  })

  it('stays quiet while the field is empty', () => {
    expect(usernameError('')).toBe('')
  })

  it('honours a custom pattern', () => {
    expect(usernameError('John', '^[a-zA-Z0-9]+$')).toBe('')
    expect(usernameError('john.doe', '^[a-zA-Z0-9]+$')).toContain('^[a-zA-Z0-9]+$')
  })

  it('follows the pattern the backend reports', () => {
    usernamePattern.value = '^[a-zA-Z0-9]+$'
    expect(usernameError('John')).toBe('')
    usernamePattern.value = DEFAULT_USERNAME_PATTERN
  })
})
