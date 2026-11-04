import type { Mock, Mocked } from 'vitest'
import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from '../groups/groups.service'
import { MailService } from '../mail/mail.service'
import { UsersService } from '../users/users.service'
import { InvitesService } from './invites.service'

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('$argon2id$mocked'),
  verify: vi.fn().mockResolvedValue(true),
  argon2id: 2,
}))

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn()
    .mockReturnValueOnce('uuid-id-1')
    .mockReturnValueOnce('uuid-token-1')
    .mockReturnValueOnce('uuid-id-2')
    .mockReturnValueOnce('uuid-token-2')
    .mockReturnValueOnce('uuid-id-3')
    .mockReturnValueOnce('uuid-token-3')
    .mockReturnValueOnce('uuid-id-4')
    .mockReturnValueOnce('uuid-token-4')
    .mockReturnValueOnce('uuid-id-5')
    .mockReturnValueOnce('uuid-token-5')
    .mockReturnValueOnce('uuid-id-6')
    .mockReturnValueOnce('uuid-token-6')
    .mockReturnValueOnce('uuid-id-7')
    .mockReturnValueOnce('uuid-token-7')
    .mockReturnValueOnce('uuid-id-8')
    .mockReturnValueOnce('uuid-token-8')
    .mockReturnValueOnce('uuid-id-9')
    .mockReturnValueOnce('uuid-token-9'),
}))

/** The email send is fire-and-forget — flush the macrotask queue so its .then() callback has run. */
function flushPromises() {
  return new Promise(resolve => setImmediate(resolve))
}

describe('invitesService', () => {
  let service: InvitesService
  let mockRun: Mock
  let mockGet: Mock
  let mockAll: Mock
  let mockUsersService: Mocked<Pick<UsersService, 'createUser'>>
  let mockGroupsService: Mocked<Pick<GroupsService, 'ensureGroup'>>
  let mockMailService: Mocked<Pick<MailService, 'sendInviteEmail'>>

  beforeEach(async () => {
    mockRun = vi.fn(() => ({ changes: 1 }))
    mockGet = vi.fn()
    mockAll = vi.fn()

    const mockDbService = {
      instance: {
        prepare: vi.fn(() => ({
          run: mockRun,
          get: mockGet,
          all: mockAll,
        })),
      },
    }

    mockUsersService = {
      createUser: vi.fn(),
    }

    mockGroupsService = {
      ensureGroup: vi.fn(),
    }

    mockMailService = {
      sendInviteEmail: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: GroupsService, useValue: mockGroupsService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile()

    service = module.get<InvitesService>(InvitesService)
  })

  describe('createInvite', () => {
    it('should insert invite and return it', async () => {
      const inviteRow = {
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        groups: '["users","admins"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
        bundle_name: null,
      }
      mockGet.mockReturnValue(inviteRow)

      const result = await service.createInvite(['users', 'admins'], 7)

      expect(mockRun).toHaveBeenCalledWith(
        'uuid-id-1',
        'uuid-token-1',
        '["users","admins"]',
        expect.any(String),
        null,
        null,
        null,
        expect.any(String),
      )
      expect(result.groups).toEqual(['users', 'admins'])
      expect(result.id).toBe('uuid-id-1')
    })

    it('should call ensureGroup for each group', async () => {
      const inviteRow = {
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        groups: '["users","admins"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
      }
      mockGet.mockReturnValue(inviteRow)

      await service.createInvite(['users', 'admins'], 7)

      expect(mockGroupsService.ensureGroup).toHaveBeenCalledTimes(2)
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('users')
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('admins')
    })

    it('should persist email and displayname when provided', async () => {
      const inviteRow = {
        id: 'uuid-id-3',
        token: 'uuid-token-3',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: 'alice@test.com',
        displayname: 'Alice',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
      }
      mockGet.mockReturnValue(inviteRow)

      const result = await service.createInvite(['users'], 7, { email: 'alice@test.com', displayname: 'Alice' })

      expect(mockRun).toHaveBeenCalledWith(
        'uuid-id-3',
        'uuid-token-3',
        '["users"]',
        expect.any(String),
        'alice@test.com',
        'Alice',
        null,
        expect.any(String),
      )
      expect(result.email).toBe('alice@test.com')
      expect(result.displayname).toBe('Alice')
    })

    it('should persist null email and displayname when prefill omitted', async () => {
      const inviteRow = {
        id: 'uuid-id-4',
        token: 'uuid-token-4',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
      }
      mockGet.mockReturnValue(inviteRow)

      await service.createInvite(['users'])

      expect(mockRun).toHaveBeenCalledWith(
        'uuid-id-4',
        'uuid-token-4',
        '["users"]',
        expect.any(String),
        null,
        null,
        null,
        expect.any(String),
      )
    })

    it('should persist the bundle name when the invite was created from a bundle', async () => {
      const inviteRow = {
        id: 'uuid-id-5',
        token: 'uuid-token-5',
        groups: '["users","media"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
        bundle_name: 'family',
      }
      mockGet.mockReturnValue(inviteRow)

      const result = await service.createInvite(['users', 'media'], 7, {}, 'family')

      expect(mockRun).toHaveBeenCalledWith(
        'uuid-id-5',
        'uuid-token-5',
        '["users","media"]',
        expect.any(String),
        null,
        null,
        'family',
        expect.any(String),
      )
      expect(result.bundle_name).toBe('family')
    })

    it('should not send email when sendEmail is false, even with an email prefilled', async () => {
      mockGet.mockReturnValue({
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: 'alice@test.com',
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })

      await service.createInvite(['users'], 7, { email: 'alice@test.com' }, undefined, false)

      expect(mockMailService.sendInviteEmail).not.toHaveBeenCalled()
    })

    it('should not send email when sendEmail is true but no email was prefilled', async () => {
      mockGet.mockReturnValue({
        id: 'uuid-id-1',
        token: 'uuid-token-1',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })

      await service.createInvite(['users'], 7, {}, undefined, true)

      expect(mockMailService.sendInviteEmail).not.toHaveBeenCalled()
    })

    it('should send email and record email_sent_at when sendEmail is true and email is set', async () => {
      mockGet.mockReturnValue({
        id: 'uuid-id-8',
        token: 'uuid-token-8',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: 'alice@test.com',
        displayname: 'Alice',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })
      mockMailService.sendInviteEmail.mockResolvedValue({ sentAt: '2024-01-01T00:00:00.000Z' })

      await service.createInvite(['users'], 7, { email: 'alice@test.com', displayname: 'Alice' }, undefined, true)
      await flushPromises()

      expect(mockMailService.sendInviteEmail).toHaveBeenCalledWith({
        to: 'alice@test.com',
        displayname: 'Alice',
        token: 'uuid-token-8',
        groups: ['users'],
        expiresAt: expect.any(String),
      })
      expect(mockRun).toHaveBeenCalledWith('2024-01-01T00:00:00.000Z', 'uuid-id-8')
    })

    it('should record email_error without throwing when the send fails', async () => {
      mockGet.mockReturnValue({
        id: 'uuid-id-9',
        token: 'uuid-token-9',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: 'alice@test.com',
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })
      mockMailService.sendInviteEmail.mockResolvedValue({ error: 'SMTP is not configured' })

      await expect(service.createInvite(['users'], 7, { email: 'alice@test.com' }, undefined, true)).resolves.toBeDefined()
      await flushPromises()

      expect(mockRun).toHaveBeenCalledWith('SMTP is not configured', 'uuid-id-9')
    })
  })

  describe('sendInviteEmail', () => {
    function pendingInviteRow(overrides: Partial<{ email: string | null, used_by: string | null, expires_at: string }> = {}) {
      return {
        id: 'inv-1',
        token: 'tok-1',
        groups: '["users","admins"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: 'alice@test.com',
        displayname: 'Alice',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
        email_sent_at: null,
        email_error: null,
        ...overrides,
      }
    }

    it('should throw NotFoundException when invite not found', async () => {
      mockGet.mockReturnValue(undefined)

      await expect(service.sendInviteEmail('missing')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when the invite has no email', async () => {
      mockGet.mockReturnValue(pendingInviteRow({ email: null }))

      await expect(service.sendInviteEmail('inv-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when the invite is already used', async () => {
      mockGet.mockReturnValue(pendingInviteRow({ used_by: 'bob' }))

      await expect(service.sendInviteEmail('inv-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when the invite is expired', async () => {
      mockGet.mockReturnValue(pendingInviteRow({ expires_at: '2020-01-01T00:00:00.000Z' }))

      await expect(service.sendInviteEmail('inv-1')).rejects.toThrow(BadRequestException)
    })

    it('should send the email with the invite groups and expiry, then record success', async () => {
      mockGet.mockReturnValue(pendingInviteRow())
      mockMailService.sendInviteEmail.mockResolvedValue({ sentAt: '2024-06-01T00:00:00.000Z' })

      await service.sendInviteEmail('inv-1')

      expect(mockMailService.sendInviteEmail).toHaveBeenCalledWith({
        to: 'alice@test.com',
        displayname: 'Alice',
        token: 'tok-1',
        groups: ['users', 'admins'],
        expiresAt: '2099-01-01T00:00:00.000Z',
      })
      expect(mockRun).toHaveBeenCalledWith('2024-06-01T00:00:00.000Z', 'inv-1')
    })

    it('should record the error and not throw when the send fails', async () => {
      mockGet.mockReturnValue(pendingInviteRow())
      mockMailService.sendInviteEmail.mockResolvedValue({ error: 'connection refused' })

      await expect(service.sendInviteEmail('inv-1')).resolves.toBeDefined()

      expect(mockRun).toHaveBeenCalledWith('connection refused', 'inv-1')
    })

    it('should work identically on a resend of a previously-sent invite', async () => {
      mockGet.mockReturnValue(pendingInviteRow({}))
      mockMailService.sendInviteEmail.mockResolvedValue({ sentAt: '2024-06-02T00:00:00.000Z' })

      await service.sendInviteEmail('inv-1')

      expect(mockMailService.sendInviteEmail).toHaveBeenCalledTimes(1)
      expect(mockRun).toHaveBeenCalledWith('2024-06-02T00:00:00.000Z', 'inv-1')
    })

    it('should throw NotFoundException if the invite was revoked while the send was in flight', async () => {
      mockGet
        .mockReturnValueOnce(pendingInviteRow())
        .mockReturnValueOnce(undefined)
      mockMailService.sendInviteEmail.mockResolvedValue({ sentAt: '2024-06-02T00:00:00.000Z' })

      await expect(service.sendInviteEmail('inv-1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('listInvites', () => {
    it('should return all invites with parsed groups', () => {
      mockAll.mockReturnValue([
        {
          id: '1',
          token: 't1',
          groups: '["users"]',
          expires_at: '2099-01-01',
          used_by: null,
          used_at: null,
          created_at: '2024-01-01',
        },
        {
          id: '2',
          token: 't2',
          groups: '["admins"]',
          expires_at: '2099-02-01',
          used_by: 'bob',
          used_at: '2024-02-01',
          created_at: '2024-01-15',
        },
      ])

      const result = service.listInvites()

      expect(result).toHaveLength(2)
      expect(result[0].groups).toEqual(['users'])
      expect(result[1].groups).toEqual(['admins'])
      expect(result[1].used_by).toBe('bob')
    })

    it('should return empty array when no invites', () => {
      mockAll.mockReturnValue([])

      expect(service.listInvites()).toEqual([])
    })
  })

  describe('getByToken', () => {
    it('should return invite when found', () => {
      mockGet.mockReturnValue({
        id: '1',
        token: 'abc',
        groups: '["users"]',
        expires_at: '2099-01-01',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })

      const result = service.getByToken('abc')

      expect(result).not.toBeNull()
      expect(result!.token).toBe('abc')
      expect(result!.groups).toEqual(['users'])
    })

    it('should return null when not found', () => {
      mockGet.mockReturnValue(undefined)

      expect(service.getByToken('missing')).toBeNull()
    })
  })

  describe('getById', () => {
    it('should return invite when found', () => {
      mockGet.mockReturnValue({
        id: 'x',
        token: 'y',
        groups: '[]',
        expires_at: '2099-01-01',
        used_by: null,
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

  describe('redeemInvite', () => {
    it('should throw NotFoundException when invite not found', async () => {
      mockGet.mockReturnValue(undefined)

      await expect(
        service.redeemInvite('bad-token', 'user', 'User', 'u@t.com', 'pass1234'),
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when invite already used', async () => {
      mockGet.mockReturnValue({
        id: '1',
        token: 'tok',
        groups: '["users"]',
        expires_at: '2099-01-01',
        used_by: 'alice',
        used_at: '2024-01-01',
        created_at: '2024-01-01',
      })

      await expect(
        service.redeemInvite('tok', 'user', 'User', 'u@t.com', 'pass1234'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when invite expired', async () => {
      mockGet.mockReturnValue({
        id: '1',
        token: 'tok',
        groups: '["users"]',
        expires_at: '2020-01-01T00:00:00.000Z',
        used_by: null,
        used_at: null,
        created_at: '2020-01-01',
      })

      await expect(
        service.redeemInvite('tok', 'user', 'User', 'u@t.com', 'pass1234'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should create user and update invite on success', async () => {
      mockGet.mockReturnValue({
        id: 'inv-1',
        token: 'valid-tok',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })
      const createdUser = {
        username: 'newuser',
        displayname: 'New',
        email: 'n@t.com',
        groups: ['users'],
      }
      mockUsersService.createUser.mockResolvedValue(createdUser)

      const result = await service.redeemInvite('valid-tok', 'newuser', 'New', 'n@t.com', 'pass1234')

      expect(mockUsersService.createUser).toHaveBeenCalledWith('newuser', 'New', 'n@t.com', 'pass1234', ['users'])
      expect(mockRun).toHaveBeenCalledWith('newuser', expect.any(String), 'inv-1')
      expect(result).toEqual(createdUser)
    })

    it('should use the invite email and displayname over client-submitted values when the invite fixed them', async () => {
      mockGet.mockReturnValue({
        id: 'inv-2',
        token: 'fixed-tok',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: 'fixed@t.com',
        displayname: 'Fixed Name',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })
      mockUsersService.createUser.mockResolvedValue({
        username: 'newuser',
        displayname: 'Fixed Name',
        email: 'fixed@t.com',
        groups: ['users'],
      })

      await service.redeemInvite('fixed-tok', 'newuser', 'Sneaky Name', 'sneaky@t.com', 'pass1234')

      expect(mockUsersService.createUser).toHaveBeenCalledWith('newuser', 'Fixed Name', 'fixed@t.com', 'pass1234', ['users'])
    })

    it('should use client-submitted email and displayname when the invite did not fix them', async () => {
      mockGet.mockReturnValue({
        id: 'inv-3',
        token: 'free-tok',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })
      mockUsersService.createUser.mockResolvedValue({
        username: 'newuser',
        displayname: 'Own Name',
        email: 'own@t.com',
        groups: ['users'],
      })

      await service.redeemInvite('free-tok', 'newuser', 'Own Name', 'own@t.com', 'pass1234')

      expect(mockUsersService.createUser).toHaveBeenCalledWith('newuser', 'Own Name', 'own@t.com', 'pass1234', ['users'])
    })

    it('should propagate ServiceUnavailableException from createUser and leave the invite unused', async () => {
      mockGet.mockReturnValue({
        id: 'inv-4',
        token: 'unreadable-tok',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })
      mockUsersService.createUser.mockRejectedValue(
        new ServiceUnavailableException('The users database file could not be parsed: bad indentation'),
      )

      await expect(
        service.redeemInvite('unreadable-tok', 'newuser', 'New', 'n@t.com', 'pass1234'),
      ).rejects.toThrow(ServiceUnavailableException)
      expect(mockRun).toHaveBeenLastCalledWith('inv-4', 'newuser')
    })

    it('should refuse with "already been used" when the invite is claimed between the read and the claim', async () => {
      mockGet.mockReturnValue({
        id: 'inv-5',
        token: 'raced-tok',
        groups: '["users"]',
        expires_at: '2099-01-01T00:00:00.000Z',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })
      mockRun.mockReturnValue({ changes: 0 })

      await expect(
        service.redeemInvite('raced-tok', 'newuser', 'New', 'n@t.com', 'pass1234'),
      ).rejects.toThrow('Invite has already been used')
      expect(mockUsersService.createUser).not.toHaveBeenCalled()
    })
  })

  describe('redeemInvite against a real database', () => {
    let database: DatabaseService
    let accounts: Map<string, string>
    let realService: InvitesService

    beforeEach(() => {
      database = new DatabaseService({
        get: (key: string, defaultVal?: string) => key === 'TEGATA_DB_PATH'
          ? ':memory:'
          : defaultVal,
      } as unknown as ConfigService)
      database.onModuleInit()
      database.instance
        .prepare('INSERT INTO invites (id, token, groups, expires_at) VALUES (?, ?, ?, ?)')
        .run('inv-race', 'race-tok', '["users"]', '2099-01-01T00:00:00.000Z')

      // Stands in for the argon2 hash: createUser yields before it writes, the gap two redemptions race through.
      accounts = new Map([
        ['taken', 'Taken'],
      ])
      const usersService = {
        createUser: vi.fn(async (username: string, displayname: string) => {
          await new Promise(resolve => setImmediate(resolve))
          if (accounts.has(username))
            throw new ConflictException(`User "${username}" already exists`)
          accounts.set(username, displayname)
          return { username, displayname }
        }),
      }
      realService = new InvitesService(
        database,
        usersService as unknown as UsersService,
        mockGroupsService as unknown as GroupsService,
        mockMailService as unknown as MailService,
      )
    })

    it('should create exactly one account and refuse the other when one invite is redeemed twice at once', async () => {
      const results = await Promise.allSettled([
        realService.redeemInvite('race-tok', 'first', 'First', 'f@t.com', 'pass1234'),
        realService.redeemInvite('race-tok', 'second', 'Second', 's@t.com', 'pass1234'),
      ])

      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      const refusals = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      expect(refusals).toHaveLength(1)
      expect(refusals[0].reason).toBeInstanceOf(BadRequestException)
      expect(refusals[0].reason.message).toBe('Invite has already been used')
      expect([
        ...accounts.keys(),
      ]).toEqual(['taken', 'first'])
      expect(realService.getById('inv-race')?.used_by).toBe('first')
    })

    it('should leave the invite redeemable after a taken username is refused', async () => {
      await expect(
        realService.redeemInvite('race-tok', 'taken', 'Taken', 't@t.com', 'pass1234'),
      ).rejects.toThrow(ConflictException)
      expect(realService.getById('inv-race')).toMatchObject({ used_by: null, used_at: null })

      await realService.redeemInvite('race-tok', 'fresh', 'Fresh', 'r@t.com', 'pass1234')

      expect(realService.getById('inv-race')?.used_by).toBe('fresh')
    })

    describe('timestamps outside UTC', () => {
      beforeEach(() => {
        // A zoneless `2026-10-31 12:34:56` parses as local time, so only a non-UTC zone shows the offset.
        vi.stubEnv('TZ', 'Europe/Berlin')
      })

      afterEach(() => {
        vi.unstubAllEnvs()
      })

      function expectNow(timestamp: string | null | undefined) {
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
        expect(Math.abs(Date.parse(timestamp!) - Date.now())).toBeLessThan(5000)
      }

      it('should stamp a freshly created invite with the current instant', async () => {
        vi.mocked(randomUUID)
          .mockReturnValueOnce('00000000-0000-0000-0000-00000000000a')
          .mockReturnValueOnce('00000000-0000-0000-0000-00000000000b')

        const invite = await realService.createInvite(['users'])

        expectNow(invite.created_at)
      })

      it('should stamp a redeemed invite with the current instant', async () => {
        await realService.redeemInvite('race-tok', 'fresh', 'Fresh', 'r@t.com', 'pass1234')

        expectNow(realService.getById('inv-race')?.used_at)
      })
    })
  })

  describe('revokeInvite', () => {
    it('should throw NotFoundException when invite not found', () => {
      mockGet.mockReturnValue(undefined)

      expect(() => service.revokeInvite('missing')).toThrow(NotFoundException)
    })

    it('should delete invite from database', () => {
      mockGet.mockReturnValue({
        id: 'del-1',
        token: 't',
        groups: '[]',
        expires_at: '2099-01-01',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
      })

      service.revokeInvite('del-1')

      expect(mockRun).toHaveBeenCalledWith('del-1')
    })
  })
})
