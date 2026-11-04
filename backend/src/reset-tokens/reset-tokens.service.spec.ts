import type { Mock, Mocked } from 'vitest'
import { randomUUID } from 'node:crypto'
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { MailService } from '../mail/mail.service'
import { UsersService } from '../users/users.service'
import { ResetTokensService } from './reset-tokens.service'

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('$argon2id$mocked'),
  verify: vi.fn().mockResolvedValue(true),
  argon2id: 2,
}))

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}))

const randomUUIDMock = randomUUID as unknown as Mock

/** The email send is fire-and-forget — flush the macrotask queue so its .then() callback has run. */
function flushPromises() {
  return new Promise(resolve => setImmediate(resolve))
}

describe('resetTokensService', () => {
  let service: ResetTokensService
  let mockRun: Mock
  let mockGet: Mock
  let mockAll: Mock
  let mockPrepare: Mock
  let mockUsersService: Mocked<Pick<UsersService, 'userExists' | 'resetPassword' | 'getUser'>>
  let mockMailService: Mocked<Pick<MailService, 'sendResetEmail'>>

  beforeEach(async () => {
    randomUUIDMock
      .mockReset()
      .mockReturnValueOnce('uuid-id-1')
      .mockReturnValueOnce('uuid-token-1')

    mockRun = vi.fn(() => ({ changes: 1 }))
    mockGet = vi.fn()
    mockAll = vi.fn()
    mockPrepare = vi.fn(() => ({
      run: mockRun,
      get: mockGet,
      all: mockAll,
    }))

    const mockDbService = {
      instance: { prepare: mockPrepare },
    }

    mockUsersService = {
      userExists: vi.fn(),
      resetPassword: vi.fn(),
      getUser: vi.fn(),
    }

    mockMailService = {
      sendResetEmail: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResetTokensService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile()

    service = module.get<ResetTokensService>(ResetTokensService)
  })

  describe('createResetToken', () => {
    it('should throw NotFoundException when user does not exist', async () => {
      mockUsersService.userExists.mockReturnValue(false)

      await expect(service.createResetToken('ghost')).rejects.toThrow(NotFoundException)
      expect(mockRun).not.toHaveBeenCalled()
    })

    it('should delete outstanding unredeemed tokens for the user before inserting', async () => {
      mockUsersService.userExists.mockReturnValue(true)
      mockGet.mockReturnValue({
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
      })

      await service.createResetToken('alice')

      expect(mockPrepare).toHaveBeenCalledWith(
        'DELETE FROM reset_tokens WHERE username = ? AND used_at IS NULL',
      )
      expect(mockRun).toHaveBeenNthCalledWith(1, 'alice')
    })

    it('should insert token and return it', async () => {
      mockUsersService.userExists.mockReturnValue(true)
      const tokenRow = {
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
      }
      mockGet.mockReturnValue(tokenRow)

      const result = await service.createResetToken('alice', 3)

      expect(mockRun).toHaveBeenCalledWith(
        'uuid-id-1',
        'uuid-token-1',
        'alice',
        expect.any(String),
        expect.any(String),
      )
      expect(result).toEqual(tokenRow)
    })

    it('should default to a 1-day expiry', async () => {
      mockUsersService.userExists.mockReturnValue(true)
      mockGet.mockReturnValue({
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        username: 'bob',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
      })
      const before = Date.now()

      await service.createResetToken('bob')

      const insertCall = mockRun.mock.calls.find(call => call[0] === 'uuid-id-1')!
      const expiresAt = new Date(insertCall[3] as string).getTime()
      expect(expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000)
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000)
    })

    it('should not send email when sendEmail is false', async () => {
      mockUsersService.userExists.mockReturnValue(true)
      mockGet.mockReturnValue({
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
      })

      await service.createResetToken('alice', 1, false)

      expect(mockUsersService.getUser).not.toHaveBeenCalled()
      expect(mockMailService.sendResetEmail).not.toHaveBeenCalled()
    })

    it('should look up the user record and send email when sendEmail is true', async () => {
      mockUsersService.userExists.mockReturnValue(true)
      mockUsersService.getUser.mockReturnValue({
        username: 'alice',
        displayname: 'Alice',
        email: 'alice@test.com',
        groups: [],
        disabled: false,
      })
      mockGet.mockReturnValue({
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
      })
      mockMailService.sendResetEmail.mockResolvedValue({ sentAt: '2024-01-01T00:00:00.000Z' })

      await service.createResetToken('alice', 1, true)
      await flushPromises()

      expect(mockUsersService.getUser).toHaveBeenCalledWith('alice')
      expect(mockMailService.sendResetEmail).toHaveBeenCalledWith({
        to: 'alice@test.com',
        displayname: 'Alice',
        token: 'uuid-token-1',
      })
      expect(mockRun).toHaveBeenCalledWith('2024-01-01T00:00:00.000Z', 'uuid-id-1')
    })

    it('should record email_error without throwing when the send fails', async () => {
      mockUsersService.userExists.mockReturnValue(true)
      mockUsersService.getUser.mockReturnValue({
        username: 'alice',
        displayname: 'Alice',
        email: 'alice@test.com',
        groups: [],
        disabled: false,
      })
      mockGet.mockReturnValue({
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
      })
      mockMailService.sendResetEmail.mockResolvedValue({ error: 'SMTP is not configured' })

      await expect(service.createResetToken('alice', 1, true)).resolves.toBeDefined()
      await flushPromises()

      expect(mockRun).toHaveBeenCalledWith('SMTP is not configured', 'uuid-id-1')
    })
  })

  describe('sendResetTokenEmail', () => {
    function pendingTokenRow(overrides: Partial<{ used_at: string | null, expires_at: string }> = {}) {
      return {
        id: 'rt-1',
        token: 'tok-1',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
        email_sent_at: null,
        email_error: null,
        ...overrides,
      }
    }

    it('should throw NotFoundException when token not found', async () => {
      mockGet.mockReturnValue(undefined)

      await expect(service.sendResetTokenEmail('missing')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when the token has already been used', async () => {
      mockGet.mockReturnValue(pendingTokenRow({ used_at: '2024-01-02' }))

      await expect(service.sendResetTokenEmail('rt-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when the token is expired', async () => {
      mockGet.mockReturnValue(pendingTokenRow({ expires_at: '2020-01-01T00:00:00.000Z' }))

      await expect(service.sendResetTokenEmail('rt-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when the user has no email on file', async () => {
      mockGet.mockReturnValue(pendingTokenRow())
      mockUsersService.getUser.mockReturnValue({
        username: 'alice',
        displayname: 'Alice',
        email: '',
        groups: [],
        disabled: false,
      })

      await expect(service.sendResetTokenEmail('rt-1')).rejects.toThrow(BadRequestException)
      expect(mockMailService.sendResetEmail).not.toHaveBeenCalled()
    })

    it('should resolve the email live from UsersService and send, then record success', async () => {
      mockGet.mockReturnValue(pendingTokenRow())
      mockUsersService.getUser.mockReturnValue({
        username: 'alice',
        displayname: 'Alice',
        email: 'alice@test.com',
        groups: [],
        disabled: false,
      })
      mockMailService.sendResetEmail.mockResolvedValue({ sentAt: '2024-06-01T00:00:00.000Z' })

      await service.sendResetTokenEmail('rt-1')

      expect(mockUsersService.getUser).toHaveBeenCalledWith('alice')
      expect(mockMailService.sendResetEmail).toHaveBeenCalledWith({
        to: 'alice@test.com',
        displayname: 'Alice',
        token: 'tok-1',
      })
      expect(mockRun).toHaveBeenCalledWith('2024-06-01T00:00:00.000Z', 'rt-1')
    })

    it('should record the error and not throw when the send fails', async () => {
      mockGet.mockReturnValue(pendingTokenRow())
      mockUsersService.getUser.mockReturnValue({
        username: 'alice',
        displayname: 'Alice',
        email: 'alice@test.com',
        groups: [],
        disabled: false,
      })
      mockMailService.sendResetEmail.mockResolvedValue({ error: 'connection refused' })

      await expect(service.sendResetTokenEmail('rt-1')).resolves.toBeDefined()

      expect(mockRun).toHaveBeenCalledWith('connection refused', 'rt-1')
    })

    it('should work identically on a resend of a previously-sent token', async () => {
      mockGet.mockReturnValue(pendingTokenRow())
      mockUsersService.getUser.mockReturnValue({
        username: 'alice',
        displayname: 'Alice',
        email: 'alice@test.com',
        groups: [],
        disabled: false,
      })
      mockMailService.sendResetEmail.mockResolvedValue({ sentAt: '2024-06-02T00:00:00.000Z' })

      await service.sendResetTokenEmail('rt-1')

      expect(mockMailService.sendResetEmail).toHaveBeenCalledTimes(1)
      expect(mockRun).toHaveBeenCalledWith('2024-06-02T00:00:00.000Z', 'rt-1')
    })

    it('should throw NotFoundException if the token was revoked while the send was in flight', async () => {
      mockGet
        .mockReturnValueOnce(pendingTokenRow())
        .mockReturnValueOnce(undefined)
      mockUsersService.getUser.mockReturnValue({
        username: 'alice',
        displayname: 'Alice',
        email: 'alice@test.com',
        groups: [],
        disabled: false,
      })
      mockMailService.sendResetEmail.mockResolvedValue({ sentAt: '2024-06-02T00:00:00.000Z' })

      await expect(service.sendResetTokenEmail('rt-1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('listResetTokens', () => {
    it('should return all reset tokens', () => {
      const rows = [
        {
          id: '1',
          token: 't1',
          username: 'alice',
          expires_at: '2099-01-01',
          used_at: null,
          created_at: '2024-01-01',
        },
        {
          id: '2',
          token: 't2',
          username: 'bob',
          expires_at: '2099-02-01',
          used_at: '2024-02-01',
          created_at: '2024-01-15',
        },
      ]
      mockAll.mockReturnValue(rows)

      expect(service.listResetTokens()).toEqual(rows)
    })

    it('should return empty array when no tokens', () => {
      mockAll.mockReturnValue([])

      expect(service.listResetTokens()).toEqual([])
    })
  })

  describe('getByToken', () => {
    it('should return token when found', () => {
      const row = {
        id: '1',
        token: 'abc',
        username: 'alice',
        expires_at: '2099-01-01',
        used_at: null,
        created_at: '2024-01-01',
      }
      mockGet.mockReturnValue(row)

      expect(service.getByToken('abc')).toEqual(row)
    })

    it('should return null when not found', () => {
      mockGet.mockReturnValue(undefined)

      expect(service.getByToken('missing')).toBeNull()
    })
  })

  describe('getById', () => {
    it('should return token when found', () => {
      mockGet.mockReturnValue({
        id: 'x',
        token: 'y',
        username: 'alice',
        expires_at: '2099-01-01',
        used_at: null,
        created_at: '2024-01-01',
      })

      expect(service.getById('x')).not.toBeNull()
    })

    it('should return null when not found', () => {
      mockGet.mockReturnValue(undefined)

      expect(service.getById('missing')).toBeNull()
    })
  })

  describe('redeemResetToken', () => {
    it('should throw NotFoundException when token not found', async () => {
      mockGet.mockReturnValue(undefined)

      await expect(service.redeemResetToken('bad-token', 'pass1234')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when token already used', async () => {
      mockGet.mockReturnValue({
        id: '1',
        token: 'tok',
        username: 'alice',
        expires_at: '2099-01-01',
        used_at: '2024-01-01',
        created_at: '2024-01-01',
      })

      await expect(service.redeemResetToken('tok', 'pass1234')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when token expired', async () => {
      mockGet.mockReturnValue({
        id: '1',
        token: 'tok',
        username: 'alice',
        expires_at: '2020-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2020-01-01',
      })

      await expect(service.redeemResetToken('tok', 'pass1234')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when user no longer exists', async () => {
      mockGet.mockReturnValue({
        id: '1',
        token: 'tok',
        username: 'deleted-user',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
      })
      mockUsersService.userExists.mockReturnValue(false)

      await expect(service.redeemResetToken('tok', 'pass1234')).rejects.toThrow(BadRequestException)
      expect(mockUsersService.resetPassword).not.toHaveBeenCalled()
    })

    it('should reset password and mark token used on success', async () => {
      mockGet.mockReturnValue({
        id: 'rt-1',
        token: 'valid-tok',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
      })
      mockUsersService.userExists.mockReturnValue(true)
      mockUsersService.resetPassword.mockResolvedValue(undefined)

      const result = await service.redeemResetToken('valid-tok', 'newpass99')

      expect(mockUsersService.resetPassword).toHaveBeenCalledWith('alice', 'newpass99')
      expect(mockRun).toHaveBeenCalledWith(expect.any(String), 'rt-1')
      expect(result).toEqual({ username: 'alice' })
    })

    it('should propagate ServiceUnavailableException from the userExists precheck instead of a misleading "no longer exists", and leave the token unused', async () => {
      mockGet.mockReturnValue({
        id: 'rt-1',
        token: 'valid-tok',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
      })
      mockUsersService.userExists.mockImplementation(() => {
        throw new ServiceUnavailableException('The users database file could not be parsed: bad indentation')
      })

      await expect(service.redeemResetToken('valid-tok', 'newpass99')).rejects.toThrow(ServiceUnavailableException)
      expect(mockUsersService.resetPassword).not.toHaveBeenCalled()
      expect(mockRun).not.toHaveBeenCalledWith('rt-1')
    })

    it('should refuse with "already been used" when the token is claimed between the read and the claim', async () => {
      mockGet.mockReturnValue({
        id: 'rt-2',
        token: 'raced-tok',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
      })
      mockUsersService.userExists.mockReturnValue(true)
      mockRun.mockReturnValue({ changes: 0 })

      await expect(service.redeemResetToken('raced-tok', 'newpass99')).rejects.toThrow('Reset token has already been used')
      expect(mockUsersService.resetPassword).not.toHaveBeenCalled()
    })
  })

  describe('against a real database', () => {
    let database: DatabaseService
    let realService: ResetTokensService
    let usersService: Mocked<Pick<UsersService, 'userExists' | 'resetPassword' | 'getUser'>>

    beforeEach(() => {
      database = new DatabaseService({
        get: (key: string, defaultVal?: string) => key === 'TEGATA_DB_PATH'
          ? ':memory:'
          : defaultVal,
      } as unknown as ConfigService)
      database.onModuleInit()
      database.instance
        .prepare('INSERT INTO reset_tokens (id, token, username, expires_at) VALUES (?, ?, ?, ?)')
        .run('rt-race', 'race-tok', 'alice', '2099-01-01T00:00:00.000Z')

      usersService = {
        userExists: vi.fn(() => true),
        // Stands in for the argon2 hash: resetPassword yields before it writes, the gap two redemptions race through.
        resetPassword: vi.fn(() => new Promise<void>(resolve => setImmediate(resolve))),
        getUser: vi.fn(),
      }
      realService = new ResetTokensService(
        database,
        usersService as unknown as UsersService,
        mockMailService as unknown as MailService,
      )
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('should reset the password once and refuse the other when one token is redeemed twice at once', async () => {
      const results = await Promise.allSettled([
        realService.redeemResetToken('race-tok', 'first-pass'),
        realService.redeemResetToken('race-tok', 'second-pass'),
      ])

      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      const refusals = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      expect(refusals).toHaveLength(1)
      expect(refusals[0].reason).toBeInstanceOf(BadRequestException)
      expect(usersService.resetPassword).toHaveBeenCalledTimes(1)
      expect(usersService.resetPassword).toHaveBeenCalledWith('alice', 'first-pass')
    })

    it('should leave the token redeemable when the password write fails', async () => {
      usersService.resetPassword.mockRejectedValueOnce(new ServiceUnavailableException('unreadable'))

      await expect(realService.redeemResetToken('race-tok', 'first-pass')).rejects.toThrow(ServiceUnavailableException)
      expect(realService.getById('rt-race')?.used_at).toBeNull()

      await expect(realService.redeemResetToken('race-tok', 'second-pass')).resolves.toEqual({ username: 'alice' })
      expect(realService.getById('rt-race')?.used_at).not.toBeNull()
    })

    it('should drop rather than revive the token when its user was deleted while the password was hashing', async () => {
      usersService.resetPassword.mockImplementationOnce(async () => {
        // What UsersService.deleteUser does to the token table: it spares the row only because it is claimed.
        database.instance.prepare('DELETE FROM reset_tokens WHERE username = ? AND used_at IS NULL').run('alice')
        throw new NotFoundException('User "alice" not found')
      })

      await expect(realService.redeemResetToken('race-tok', 'first-pass')).rejects.toThrow(NotFoundException)

      expect(realService.getById('rt-race')).toBeNull()
    })

    it('should drop rather than revive the token when a newer one was issued while the password was hashing', async () => {
      usersService.resetPassword.mockImplementationOnce(async () => {
        database.instance
          .prepare('INSERT INTO reset_tokens (id, token, username, expires_at) VALUES (?, ?, ?, ?)')
          .run('rt-newer', 'newer-tok', 'alice', '2099-01-01T00:00:00.000Z')
        throw new ServiceUnavailableException('unreadable')
      })

      await expect(realService.redeemResetToken('race-tok', 'first-pass')).rejects.toThrow(ServiceUnavailableException)

      expect(realService.getById('rt-race')).toBeNull()
      expect(realService.getById('rt-newer')?.used_at).toBeNull()
    })

    it('should record the missing address on the row instead of sending when the user has no email', async () => {
      usersService.getUser.mockReturnValue({
        username: 'noemail',
        displayname: 'No Email',
        email: '',
        groups: [],
        disabled: false,
      })
      randomUUIDMock.mockReset().mockReturnValueOnce('rt-noemail').mockReturnValueOnce('noemail-tok')

      const created = await realService.createResetToken('noemail', 1, true)

      expect(created.email_error).toBe('User has no email address to send to')
      expect(created.email_sent_at).toBeNull()
      expect(mockMailService.sendResetEmail).not.toHaveBeenCalled()
    })

    it('should stamp created_at and used_at as the current instant outside UTC', async () => {
      // A zoneless `2026-10-31 12:34:56` parses as local time, so only a non-UTC zone shows the offset.
      vi.stubEnv('TZ', 'Europe/Berlin')
      randomUUIDMock.mockReset().mockReturnValueOnce('rt-fresh').mockReturnValueOnce('fresh-tok')
      const created = await realService.createResetToken('bob')
      await realService.redeemResetToken('fresh-tok', 'new-pass')
      const redeemed = realService.getById('rt-fresh')

      for (const timestamp of [created.created_at, redeemed?.used_at]) {
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
        expect(Math.abs(Date.parse(timestamp!) - Date.now())).toBeLessThan(5000)
      }
    })
  })

  describe('revokeResetToken', () => {
    it('should throw NotFoundException when token not found', () => {
      mockGet.mockReturnValue(undefined)

      expect(() => service.revokeResetToken('missing')).toThrow(NotFoundException)
    })

    it('should delete token from database', () => {
      mockGet.mockReturnValue({
        id: 'del-1',
        token: 't',
        username: 'alice',
        expires_at: '2099-01-01',
        used_at: null,
        created_at: '2024-01-01',
      })

      service.revokeResetToken('del-1')

      expect(mockRun).toHaveBeenCalledWith('del-1')
    })
  })
})
