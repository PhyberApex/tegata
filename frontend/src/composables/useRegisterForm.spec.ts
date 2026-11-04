import type { RegisterFormFields } from './useRegisterForm'
import { describe, expect, it } from 'vitest'
import { inviteFieldsPatch, passwordMatchError } from './useRegisterForm'

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
