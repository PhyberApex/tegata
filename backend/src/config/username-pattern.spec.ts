import process from 'node:process'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { afterEach, describe, expect, it } from 'vitest'
import { RedeemInviteDto } from '../invites/invites.controller'
import { CreateUserDto } from '../users/users.controller'
import { assertUsernamePattern } from './username-pattern'

async function usernameErrors(cls: any, username: string) {
  const dto = plainToInstance(cls, {
    username,
    displayname: 'D',
    email: 'a@b.com',
    password: 'password123',
    groups: [],
  })
  const errors = await validate(dto as object)
  return errors.filter(e => e.property === 'username').flatMap(e => Object.values(e.constraints ?? {}))
}

describe.each([
  ['CreateUserDto', CreateUserDto],
  ['RedeemInviteDto', RedeemInviteDto],
])('%s username', (_name, cls) => {
  afterEach(() => {
    delete process.env.USERNAME_PATTERN
  })

  it.each([
    'john doe',
    'John',
    'a/b',
    '',
    '-lead',
    'a'.repeat(65),
  ])('rejects %j with a message naming the rule', async (username) => {
    const [message] = await usernameErrors(cls, username)
    expect(message).toContain('lowercase letters, digits')
  })

  it.each([
    'john.doe-2',
    'a',
    'a'.repeat(64),
  ])('accepts %j', async (username) => {
    expect(await usernameErrors(cls, username)).toEqual([])
  })

  it('honours USERNAME_PATTERN', async () => {
    process.env.USERNAME_PATTERN = '^[a-zA-Z0-9]+$'
    expect(await usernameErrors(cls, 'John')).toEqual([])
    const [message] = await usernameErrors(cls, 'john.doe')
    expect(message).toContain('^[a-zA-Z0-9]+$')
  })
})

describe('assertUsernamePattern', () => {
  afterEach(() => {
    delete process.env.USERNAME_PATTERN
  })

  it('passes for the default and for a valid override', () => {
    expect(() => assertUsernamePattern()).not.toThrow()
    process.env.USERNAME_PATTERN = '^[a-z]+$'
    expect(() => assertUsernamePattern()).not.toThrow()
  })

  it('throws when the pattern does not compile', () => {
    process.env.USERNAME_PATTERN = '^[a-z'
    expect(() => assertUsernamePattern()).toThrow(/USERNAME_PATTERN/)
  })
})
