import type { Mock, Mocked } from 'vitest'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { hash, verify } from 'argon2'
import * as yaml from 'js-yaml'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from '../groups/groups.service'
import { UsersService } from './users.service'

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('$argon2id$mocked-hash'),
  verify: vi.fn().mockResolvedValue(true),
  argon2id: 2,
}))
const databaseMock = vi.hoisted(() => {
  const mockDb = {
    pragma: vi.fn(),
    exec: vi.fn(),
    close: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    })),
  }
  const ctor = vi.fn((..._args: unknown[]) => mockDb)
  return { mockDb, ctor }
})

vi.mock('better-sqlite3', () => ({
  default: class {
    constructor(...args: unknown[]) {
      return databaseMock.ctor(...args)
    }
  },
}))
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
  chmodSync: vi.fn(),
  renameSync: vi.fn(),
}))

const readFileSyncMock = readFileSync as unknown as Mock
const writeFileSyncMock = writeFileSync as unknown as Mock
const existsSyncMock = existsSync as unknown as Mock
const statSyncMock = statSync as unknown as Mock
const chmodSyncMock = chmodSync as unknown as Mock
const renameSyncMock = renameSync as unknown as Mock
const hashMock = hash as unknown as Mock
const verifyMock = verify as unknown as Mock

const USERS_YAML = `
users:
  alice:
    displayname: Alice Smith
    password: "$argon2id$hash1"
    email: alice@example.com
    groups:
      - admins
      - users
  bob:
    displayname: Bob Jones
    password: "$argon2id$hash2"
    email: bob@example.com
    groups:
      - users
`

const THREE_ENABLED_USERS_YAML = `
users:
  alice:
    displayname: Alice Smith
    password: "$argon2id$hash1"
    email: alice@example.com
    groups:
      - admins
  bob:
    displayname: Bob Jones
    password: "$argon2id$hash2"
    email: bob@example.com
    groups:
      - users
  carol:
    displayname: Carol White
    password: "$argon2id$hash3"
    email: carol@example.com
    groups:
      - users
`

const FOUR_ENABLED_USERS_YAML = `
users:
  alice:
    displayname: Alice Smith
    password: "$argon2id$hash1"
    email: alice@example.com
    groups:
      - admins
      - tegata
      - moderators
  bob:
    displayname: Bob Jones
    password: "$argon2id$hash2"
    email: bob@example.com
    groups:
      - users
  carol:
    displayname: Carol White
    password: "$argon2id$hash3"
    email: carol@example.com
    groups:
      - users
  dave:
    displayname: Dave Lee
    password: "$argon2id$hash4"
    email: dave@example.com
    groups:
      - users
`

const USERS_YAML_WITH_DISABLED = `
users:
  alice:
    displayname: Alice Smith
    password: "$argon2id$hash1"
    email: alice@example.com
    groups:
      - admins
      - users
    disabled: true
  bob:
    displayname: Bob Jones
    password: "$argon2id$hash2"
    email: bob@example.com
    groups:
      - users
`

function enoentError(): NodeJS.ErrnoException {
  const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

/**
 * Backs the mocked fs with one in-memory file, so a write lands where the next read sees it — what an
 * overlapping-writers spec needs, since a fixed readFileSync return value would hide a lost update.
 */
function useInMemoryUsersFile(initial: string) {
  const files = new Map<string, string>([
    ['/tmp/users.yml', initial],
  ])
  readFileSyncMock.mockImplementation((path: string) => {
    const content = files.get(path)
    if (content === undefined)
      throw enoentError()
    return content
  })
  writeFileSyncMock.mockImplementation((path: string, content: string) => files.set(path, content))
  renameSyncMock.mockImplementation((from: string, to: string) => {
    files.set(to, files.get(from)!)
    files.delete(from)
  })
}

/** Parses the users mapping out of the most recent write. */
function writtenUsers(): Record<string, { displayname: string, password: string }> {
  const content = writeFileSyncMock.mock.calls.at(-1)![1] as string
  return (yaml.load(content) as { users: Record<string, { displayname: string, password: string }> }).users
}

/** Holds every argon2.hash call open until resolveAll(), so two mutations are in flight at once. */
function deferredHashes() {
  const pending: Array<() => void> = []
  hashMock.mockImplementation(() => new Promise((resolve) => {
    const n = pending.length + 1
    pending.push(() => resolve(`$argon2id$deferred-${n}`))
  }))
  return {
    resolveAll: () => pending.forEach(resolve => resolve()),
  }
}

describe('usersService', () => {
  let service: UsersService
  let mockGroupsService: Mocked<Pick<GroupsService, 'ensureGroup'>>
  let mockRun: Mock
  let mockPrepare: Mock

  beforeEach(async () => {
    vi.clearAllMocks()
    // clearAllMocks keeps implementations, so undo what the in-memory-file and deferred-hash helpers install
    writeFileSyncMock.mockReset()
    renameSyncMock.mockReset()
    hashMock.mockResolvedValue('$argon2id$mocked-hash')
    readFileSyncMock.mockReturnValue(USERS_YAML)
    existsSyncMock.mockReturnValue(false)

    mockGroupsService = {
      ensureGroup: vi.fn(),
    }

    mockRun = vi.fn()
    mockPrepare = vi.fn(() => ({
      run: mockRun,
      get: vi.fn(),
      all: vi.fn(),
    }))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string, defaultVal?: string) =>
              key === 'AUTHELIA_USERS_FILE'
                ? '/tmp/users.yml'
                : defaultVal),
          },
        },
        { provide: GroupsService, useValue: mockGroupsService },
        {
          provide: DatabaseService,
          useValue: {
            instance: { prepare: mockPrepare },
          },
        },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
  })

  describe('onModuleInit', () => {
    it('should seed groups from existing users in the YAML file', () => {
      service.onModuleInit()

      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('admins')
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('users')
    })

    it('should not throw when file cannot be read', () => {
      readFileSyncMock.mockImplementation(() => { throw new Error('ENOENT') })

      expect(() => service.onModuleInit()).not.toThrow()
    })

    it('should not throw and should seed no groups when the database is unreadable (invalid YAML)', () => {
      readFileSyncMock.mockReturnValue('not: [valid: yaml')

      expect(() => service.onModuleInit()).not.toThrow()
      expect(mockGroupsService.ensureGroup).not.toHaveBeenCalled()
    })
  })

  describe('listUsers', () => {
    it('should return users without passwords', () => {
      const users = service.listUsers()

      expect(users).toHaveLength(2)
      expect(users[0]).toEqual({
        username: 'alice',
        displayname: 'Alice Smith',
        email: 'alice@example.com',
        groups: ['admins', 'users'],
        disabled: false,
      })
      expect(users[1]).toEqual({
        username: 'bob',
        displayname: 'Bob Jones',
        email: 'bob@example.com',
        groups: ['users'],
        disabled: false,
      })
    })

    it('should return empty array when file cannot be read', () => {
      readFileSyncMock.mockImplementation(() => { throw new Error('ENOENT') })

      expect(service.listUsers()).toEqual([])
    })

    it('should normalize disabled to true for users with the flag set', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)

      const users = service.listUsers()

      expect(users.find(u => u.username === 'alice')?.disabled).toBe(true)
      expect(users.find(u => u.username === 'bob')?.disabled).toBe(false)
    })
  })

  describe('createUser', () => {
    it('should create a new user and write to file', async () => {
      hashMock.mockResolvedValue('$argon2id$newhash')

      const result = await service.createUser('charlie', 'Charlie', 'charlie@test.com', 'password123', ['users'])

      expect(result).toEqual({
        username: 'charlie',
        displayname: 'Charlie',
        email: 'charlie@test.com',
        groups: ['users'],
      })
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/users.yml.tmp',
        expect.stringContaining('charlie'),
        'utf-8',
      )
      expect(renameSyncMock).toHaveBeenCalledWith('/tmp/users.yml.tmp', '/tmp/users.yml')
    })

    it('should preserve existing file permissions across the rename', async () => {
      hashMock.mockResolvedValue('$argon2id$newhash')
      existsSyncMock.mockReturnValue(true)
      statSyncMock.mockReturnValue({ mode: 0o100644 })

      await service.createUser('erin', 'Erin', 'erin@test.com', 'pass1234', [])

      expect(chmodSyncMock).toHaveBeenCalledWith('/tmp/users.yml.tmp', 0o644)
    })

    it('should call ensureGroup for each group', async () => {
      hashMock.mockResolvedValue('$argon2id$newhash')

      await service.createUser('dave', 'Dave', 'dave@test.com', 'pass1234', ['users', 'admins'])

      expect(mockGroupsService.ensureGroup).toHaveBeenCalledTimes(2)
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('users')
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('admins')
    })

    it('should throw ConflictException if user already exists', async () => {
      await expect(
        service.createUser('alice', 'Alice', 'a@b.com', 'pass1234', []),
      ).rejects.toThrow(ConflictException)
    })

    it('should keep both users when two createUser calls overlap', async () => {
      useInMemoryUsersFile(USERS_YAML)
      const hashes = deferredHashes()

      const first = service.createUser('charlie', 'Charlie', 'charlie@test.com', 'pass1234', ['users'])
      const second = service.createUser('dana', 'Dana', 'dana@test.com', 'pass1234', ['users'])
      hashes.resolveAll()
      await Promise.all([first, second])

      expect(Object.keys(writtenUsers())).toEqual(['alice', 'bob', 'charlie', 'dana'])
    })

    it('should refuse the second of two overlapping createUser calls for the same username', async () => {
      useInMemoryUsersFile(USERS_YAML)
      const hashes = deferredHashes()

      const first = service.createUser('charlie', 'Charlie', 'charlie@test.com', 'pass1234', [])
      const second = service.createUser('charlie', 'Other Charlie', 'other@test.com', 'pass5678', [])
      hashes.resolveAll()

      await expect(first).resolves.toMatchObject({ displayname: 'Charlie' })
      await expect(second).rejects.toThrow(ConflictException)
      expect(writtenUsers().charlie.displayname).toBe('Charlie')
    })

    it('should hash password with argon2id options', async () => {
      hashMock.mockResolvedValue('$argon2id$hashed')

      await service.createUser('new', 'New', 'new@test.com', 'mypassword', [])

      expect(hashMock).toHaveBeenCalledWith('mypassword', expect.objectContaining({
        type: 2,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      }))
    })

    it('should hash with the ARGON2_* parameters from config', async () => {
      const config = {
        get: vi.fn((key: string, defaultVal?: string) => ({ ARGON2_MEMORY_KIB: '19456', ARGON2_ITERATIONS: '2', ARGON2_PARALLELISM: '1' } as Record<string, string>)[key] ?? defaultVal ?? ''),
      }
      const tuned = new UsersService(config as unknown as ConfigService, mockGroupsService as unknown as GroupsService, {
        instance: { prepare: mockPrepare },
      } as unknown as DatabaseService)

      await tuned.createUser('new', 'New', 'new@test.com', 'mypassword', [])

      expect(hashMock).toHaveBeenCalledWith('mypassword', expect.objectContaining({ memoryCost: 19456, timeCost: 2, parallelism: 1 }))
    })

    it('should refuse to construct with invalid ARGON2_* values', () => {
      const config = {
        get: vi.fn((key: string, defaultVal?: string) => key === 'ARGON2_ITERATIONS'
          ? 'x'
          : defaultVal ?? ''),
      }
      expect(() => new UsersService(config as unknown as ConfigService, mockGroupsService as unknown as GroupsService, {} as unknown as DatabaseService)).toThrow(/ARGON2_ITERATIONS/)
    })
  })

  describe('updateUser', () => {
    it('should update specified fields only', () => {
      const result = service.updateUser('alice', { displayname: 'Alice Updated' })

      expect(result).toEqual({
        username: 'alice',
        displayname: 'Alice Updated',
        email: 'alice@example.com',
        groups: ['admins', 'users'],
        disabled: false,
      })
      expect(writeFileSyncMock).toHaveBeenCalled()
    })

    it('should throw NotFoundException for unknown user', () => {
      expect(() => service.updateUser('ghost', { email: 'x@y.com' })).toThrow(NotFoundException)
    })

    it('should update all fields when all provided', () => {
      const result = service.updateUser('bob', {
        displayname: 'Robert',
        email: 'robert@test.com',
        groups: ['admins'],
      })

      expect(result).toEqual({
        username: 'bob',
        displayname: 'Robert',
        email: 'robert@test.com',
        groups: ['admins'],
        disabled: false,
      })
    })

    it('should call ensureGroup for each group when groups are updated', () => {
      service.updateUser('alice', {
        groups: ['users', 'moderators'],
      })

      expect(mockGroupsService.ensureGroup).toHaveBeenCalledTimes(2)
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('users')
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('moderators')
    })

    it('should not call ensureGroup when groups are not in the update', () => {
      service.updateUser('alice', { displayname: 'Alice Updated' })

      expect(mockGroupsService.ensureGroup).not.toHaveBeenCalled()
    })

    it('should write disabled: true when disabling a user', () => {
      readFileSyncMock.mockReturnValue(THREE_ENABLED_USERS_YAML)

      const result = service.updateUser('alice', { disabled: true })

      expect(result).toEqual({
        username: 'alice',
        displayname: 'Alice Smith',
        email: 'alice@example.com',
        groups: ['admins'],
        disabled: true,
      })
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/users.yml.tmp',
        expect.stringContaining('disabled: true'),
        'utf-8',
      )
    })

    it('should remove the disabled key entirely when enabling a user', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)

      const result = service.updateUser('alice', { disabled: false })

      expect(result).toEqual({
        username: 'alice',
        displayname: 'Alice Smith',
        email: 'alice@example.com',
        groups: ['admins', 'users'],
        disabled: false,
      })
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/users.yml.tmp',
        expect.not.stringContaining('disabled'),
        'utf-8',
      )
    })

    it('should leave password, groups, and email untouched when only toggling disabled', () => {
      readFileSyncMock.mockReturnValue(THREE_ENABLED_USERS_YAML)

      service.updateUser('alice', { disabled: true })

      const written = writeFileSyncMock.mock.calls[0][1] as string
      expect(written).toContain('admins')
      expect(written).toContain('alice@example.com')
      expect(written).toContain('$argon2id$hash1')
    })

    it('should not touch disabled when the field is omitted', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)

      const result = service.updateUser('alice', { displayname: 'Alice Updated' })

      expect(result.disabled).toBe(true)
    })
  })

  describe('resetPassword', () => {
    it('should hash and update the password', async () => {
      hashMock.mockResolvedValue('$argon2id$resethash')

      await service.resetPassword('alice', 'newpass99')

      expect(hashMock).toHaveBeenCalledWith('newpass99', expect.anything())
      expect(writeFileSyncMock).toHaveBeenCalled()
    })

    it('should throw NotFoundException for unknown user', async () => {
      await expect(service.resetPassword('ghost', 'pass1234')).rejects.toThrow(NotFoundException)
    })

    it('should not drop a user created while the reset was hashing', async () => {
      useInMemoryUsersFile(USERS_YAML)
      const hashes = deferredHashes()

      const reset = service.resetPassword('alice', 'newpass99')
      const create = service.createUser('charlie', 'Charlie', 'charlie@test.com', 'pass1234', [])
      hashes.resolveAll()
      await Promise.all([reset, create])

      const users = writtenUsers()
      expect(Object.keys(users)).toEqual(['alice', 'bob', 'charlie'])
      expect(users.alice.password).toBe('$argon2id$deferred-1')
    })

    it('should refuse with NotFoundException when the user is deleted while the reset was hashing', async () => {
      useInMemoryUsersFile(USERS_YAML)
      const hashes = deferredHashes()

      const reset = service.resetPassword('bob', 'newpass99')
      service.deleteUser('bob', true)
      hashes.resolveAll()

      await expect(reset).rejects.toThrow(NotFoundException)
      expect(Object.keys(writtenUsers())).toEqual(['alice'])
    })
  })

  describe('verifyPassword', () => {
    it('should resolve true when argon2 verifies the stored hash', async () => {
      verifyMock.mockResolvedValue(true)

      await expect(service.verifyPassword('alice', 'correct-password')).resolves.toBe(true)
      expect(verifyMock).toHaveBeenCalledWith('$argon2id$hash1', 'correct-password')
    })

    it('should resolve false when argon2 rejects the stored hash', async () => {
      verifyMock.mockResolvedValue(false)

      await expect(service.verifyPassword('alice', 'wrong-password')).resolves.toBe(false)
    })

    it('should resolve false for a nonexistent username', async () => {
      await expect(service.verifyPassword('ghost', 'anything')).resolves.toBe(false)
    })

    it('should reject with ServiceUnavailableException instead of resolving false when the database is unreadable', async () => {
      readFileSyncMock.mockImplementation(() => { throw new Error('permission denied') })

      await expect(service.verifyPassword('alice', 'anything')).rejects.toThrow(ServiceUnavailableException)
    })
  })

  describe('userExists', () => {
    it('should return true for an existing user', () => {
      expect(service.userExists('alice')).toBe(true)
    })

    it('should return false for an unknown user', () => {
      expect(service.userExists('ghost')).toBe(false)
    })

    it('should throw ServiceUnavailableException instead of false when the database is unreadable', () => {
      readFileSyncMock.mockImplementation(() => { throw new Error('permission denied') })

      expect(() => service.userExists('alice')).toThrow(ServiceUnavailableException)
    })
  })

  describe('isEnabledUser', () => {
    it('should return true for an enabled user', () => {
      expect(service.isEnabledUser('alice')).toBe(true)
    })

    it('should return false for a Disabled user', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)

      expect(service.isEnabledUser('alice')).toBe(false)
      expect(service.isEnabledUser('bob')).toBe(true)
    })

    it('should return false for an unknown user', () => {
      expect(service.isEnabledUser('ghost')).toBe(false)
    })

    it('should throw ServiceUnavailableException instead of false when the database is unreadable', () => {
      readFileSyncMock.mockImplementation(() => { throw new Error('permission denied') })

      expect(() => service.isEnabledUser('alice')).toThrow(ServiceUnavailableException)
    })
  })

  describe('getUser', () => {
    it('should return the user when found', () => {
      expect(service.getUser('alice')).toEqual({
        username: 'alice',
        displayname: 'Alice Smith',
        email: 'alice@example.com',
        groups: ['admins', 'users'],
        disabled: false,
      })
    })

    it('should return null for an unknown user', () => {
      expect(service.getUser('ghost')).toBeNull()
    })
  })

  describe('getDatabaseIntegrityStatus', () => {
    it('should report a mismatch when no baseline hash has been recorded yet', () => {
      const mockGet = vi.fn(() => undefined)
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })

      expect(service.getDatabaseIntegrityStatus()).toEqual({ matches: false, unreadable: false, unreadableReason: null })
    })

    it('should report a match when the on-disk hash equals the baseline hash', async () => {
      await service.createUser('charlie', 'Charlie', 'charlie@test.com', 'password123', ['users'])
      const written = writeFileSyncMock.mock.calls[0][1] as string
      const baselineHash = createHash('sha256').update(written).digest('hex')
      const mockGet = vi.fn(() => ({ baseline_hash: baselineHash }))
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockReturnValue(written)

      expect(service.getDatabaseIntegrityStatus()).toEqual({ matches: true, unreadable: false, unreadableReason: null })
    })

    it('should report a mismatch when the on-disk file was changed out of band', () => {
      const baselineHash = createHash('sha256').update(USERS_YAML).digest('hex')
      const mockGet = vi.fn(() => ({ baseline_hash: baselineHash }))
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockReturnValue('users:\n  mallory:\n    displayname: Mallory\n')

      expect(service.getDatabaseIntegrityStatus()).toEqual({ matches: false, unreadable: false, unreadableReason: null })
    })

    it('should report a mismatch when the file cannot be read', () => {
      const mockGet = vi.fn(() => ({ baseline_hash: 'somehash' }))
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockImplementation(() => { throw new Error('ENOENT') })

      const status = service.getDatabaseIntegrityStatus()
      expect(status.matches).toBe(false)
      expect(status.unreadable).toBe(true)
      expect(status.unreadableReason).toContain('could not be read')
    })

    it('should stay a mismatch once flagged, even if the on-disk hash currently equals the baseline again', () => {
      const mockGet = vi.fn(() => ({ baseline_hash: 'somehash', mismatch_detected: 1 }))
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockReturnValue(USERS_YAML)

      expect(service.getDatabaseIntegrityStatus()).toEqual({ matches: false, unreadable: false, unreadableReason: null })
    })

    it('should report unreadable with the missing-file reason when a baseline row exists and the file is gone', () => {
      const mockGet = vi.fn(() => ({ baseline_hash: 'somehash' }))
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockImplementation(() => { throw enoentError() })

      const status = service.getDatabaseIntegrityStatus()
      expect(status.unreadable).toBe(true)
      expect(status.unreadableReason).toBe('The users database file is missing')
    })

    it('should not report unreadable for ENOENT with no baseline row recorded yet', () => {
      const mockGet = vi.fn(() => undefined)
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockImplementation(() => { throw enoentError() })

      expect(service.getDatabaseIntegrityStatus()).toEqual({ matches: false, unreadable: false, unreadableReason: null })
    })
  })

  describe('out-of-band edit detection on plain reads', () => {
    it('should persist a newly found mismatch from listUsers, not just from the status endpoint', () => {
      const baselineHash = createHash('sha256').update(USERS_YAML).digest('hex')
      const mockGet = vi.fn(() => ({ baseline_hash: baselineHash, mismatch_detected: 0 }))
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockReturnValue('users:\n  mallory:\n    displayname: Mallory\n')

      service.listUsers()

      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE users_database_integrity SET mismatch_detected = 1'))
    })

    it('should not re-flag when a mismatch is already sticky', () => {
      const mockGet = vi.fn(() => ({ baseline_hash: 'somehash', mismatch_detected: 1 }))
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })

      service.listUsers()

      expect(mockPrepare).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE users_database_integrity'))
    })
  })

  describe('unreadable users database', () => {
    it('should refuse createUser with ServiceUnavailableException on invalid YAML, without touching the file', async () => {
      readFileSyncMock.mockReturnValue('not: [valid: yaml')

      await expect(
        service.createUser('newuser', 'New', 'new@test.com', 'pass1234', []),
      ).rejects.toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should refuse updateUser with ServiceUnavailableException on invalid YAML, without touching the file', () => {
      readFileSyncMock.mockReturnValue('not: [valid: yaml')

      expect(() => service.updateUser('alice', { displayname: 'X' })).toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should refuse resetPassword with ServiceUnavailableException on invalid YAML, without touching the file', async () => {
      readFileSyncMock.mockReturnValue('not: [valid: yaml')

      await expect(service.resetPassword('alice', 'newpass99')).rejects.toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should refuse deleteUser with ServiceUnavailableException on invalid YAML, without touching the file', () => {
      readFileSyncMock.mockReturnValue('not: [valid: yaml')

      expect(() => service.deleteUser('alice')).toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should refuse writes on a zero-byte file', () => {
      readFileSyncMock.mockReturnValue('')

      expect(() => service.updateUser('alice', { displayname: 'X' })).toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should refuse writes when the file parses without a users mapping', () => {
      readFileSyncMock.mockReturnValue('other: data\n')

      expect(() => service.updateUser('alice', { displayname: 'X' })).toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should refuse writes when users parses to an array rather than a mapping', () => {
      readFileSyncMock.mockReturnValue('users:\n  - alice\n  - bob\n')

      expect(() => service.updateUser('alice', { displayname: 'X' })).toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should refuse writes on a non-ENOENT read error such as permission denied', () => {
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException
      err.code = 'EACCES'
      readFileSyncMock.mockImplementation(() => { throw err })

      expect(() => service.updateUser('alice', { displayname: 'X' })).toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should still start empty on ENOENT with no baseline row recorded (fresh install)', async () => {
      const mockGet = vi.fn(() => undefined)
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockImplementation(() => { throw enoentError() })

      await expect(
        service.createUser('newuser', 'New', 'new@test.com', 'pass1234', []),
      ).resolves.toBeDefined()
      expect(writeFileSyncMock).toHaveBeenCalled()
    })

    it('should refuse writes on ENOENT once a baseline row has been recorded, without creating a file', async () => {
      const mockGet = vi.fn(() => ({ baseline_hash: 'somehash' }))
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: vi.fn(),
      })
      readFileSyncMock.mockImplementation(() => { throw enoentError() })

      await expect(
        service.createUser('newuser', 'New', 'new@test.com', 'pass1234', []),
      ).rejects.toThrow(ServiceUnavailableException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should succeed on the next write once a valid file is back, with no admin action needed', () => {
      readFileSyncMock.mockReturnValue('not: [valid: yaml')
      expect(() => service.updateUser('alice', { displayname: 'X' })).toThrow(ServiceUnavailableException)

      readFileSyncMock.mockReturnValue(USERS_YAML)
      expect(() => service.updateUser('alice', { displayname: 'Alice Updated' })).not.toThrow()
      expect(writeFileSyncMock).toHaveBeenCalled()
    })

    it('should keep reads working with an empty list while the database is unreadable', () => {
      readFileSyncMock.mockReturnValue('not: [valid: yaml')

      expect(service.listUsers()).toEqual([])
    })
  })

  describe('writeDatabase side effect', () => {
    it('should record the baseline hash of the exact bytes written after a successful write', async () => {
      await service.createUser('charlie', 'Charlie', 'charlie@test.com', 'password123', ['users'])

      const written = writeFileSyncMock.mock.calls[0][1] as string
      const expectedHash = createHash('sha256').update(written).digest('hex')

      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users_database_integrity'))
      expect(mockRun).toHaveBeenCalledWith(expectedHash)
    })

    it('should leave mismatch_detected untouched when recording the baseline (only Accept Baseline resets it)', async () => {
      await service.createUser('charlie', 'Charlie', 'charlie@test.com', 'password123', ['users'])

      const integritySql = mockPrepare.mock.calls
        .map(([sql]) => sql as string)
        .find(sql => sql.includes('INSERT INTO users_database_integrity'))

      expect(integritySql).toBeDefined()
      expect(integritySql).not.toMatch(/ON CONFLICT[\s\S]*mismatch_detected/)
    })

    it('should not fail the write when recording the baseline hash throws', async () => {
      const throwingRun = vi.fn(() => { throw new Error('SQLITE_BUSY') })
      mockPrepare.mockReturnValue({
        run: throwingRun,
        get: vi.fn(),
        all: vi.fn(),
      })

      await expect(
        service.createUser('charlie', 'Charlie', 'charlie@test.com', 'password123', ['users']),
      ).resolves.toBeDefined()
      expect(renameSyncMock).toHaveBeenCalledWith('/tmp/users.yml.tmp', '/tmp/users.yml')
    })
  })

  describe('acceptDatabaseBaseline', () => {
    it('should set the baseline hash to the current on-disk hash', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML)
      const expectedHash = createHash('sha256').update(USERS_YAML).digest('hex')

      service.acceptDatabaseBaseline()

      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users_database_integrity'))
      expect(mockRun).toHaveBeenCalledWith(expectedHash)
    })

    it('should clear a pending mismatch flag in its ON CONFLICT clause, unlike a normal write', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML)

      service.acceptDatabaseBaseline()

      const integritySql = mockPrepare.mock.calls
        .map(([sql]) => sql as string)
        .find(sql => sql.includes('INSERT INTO users_database_integrity'))

      expect(integritySql).toMatch(/ON CONFLICT[\s\S]*mismatch_detected = 0/)
    })

    it('should throw NotFoundException when the file cannot be read', () => {
      readFileSyncMock.mockImplementation(() => { throw new Error('ENOENT') })

      expect(() => service.acceptDatabaseBaseline()).toThrow(NotFoundException)
    })
  })

  describe('deleteUser', () => {
    it('should remove the user and write', () => {
      readFileSyncMock.mockReturnValue(THREE_ENABLED_USERS_YAML)

      service.deleteUser('bob')

      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/users.yml.tmp',
        expect.not.stringContaining('bob'),
        'utf-8',
      )
      expect(renameSyncMock).toHaveBeenCalledWith('/tmp/users.yml.tmp', '/tmp/users.yml')
    })

    it('should cascade delete the user\'s outstanding reset tokens', () => {
      readFileSyncMock.mockReturnValue(THREE_ENABLED_USERS_YAML)

      service.deleteUser('bob')

      expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM reset_tokens WHERE username = ? AND used_at IS NULL')
      expect(mockRun).toHaveBeenCalledWith('bob')
    })

    it('should throw NotFoundException for unknown user', () => {
      expect(() => service.deleteUser('ghost')).toThrow(NotFoundException)
    })
  })

  describe('deleteUser enabled-count guard', () => {
    it('should refuse deleting a user that would leave only 1 enabled user', () => {
      expect(() => service.deleteUser('bob')).toThrow(ConflictException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should identify the resulting enabled-user count in the rejection', () => {
      try {
        service.deleteUser('bob')
        throw new Error('expected deleteUser to throw')
      }
      catch (err) {
        expect(err).toBeInstanceOf(ConflictException)
        expect((err as ConflictException).getResponse()).toEqual(
          expect.objectContaining({ confirmRequired: true, enabledCount: 1, emptiedGroups: [] }),
        )
      }
    })

    it('should proceed when confirm is true', () => {
      service.deleteUser('bob', true)

      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/users.yml.tmp',
        expect.not.stringContaining('bob'),
        'utf-8',
      )
    })

    it('should not guard when deleting an already-disabled user, regardless of resulting count', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)

      expect(() => service.deleteUser('alice')).not.toThrow()
      expect(writeFileSyncMock).toHaveBeenCalled()
    })

    it('should not require confirmation when 2+ enabled users remain', () => {
      readFileSyncMock.mockReturnValue(THREE_ENABLED_USERS_YAML)

      expect(() => service.deleteUser('carol')).not.toThrow()
      expect(writeFileSyncMock).toHaveBeenCalled()
    })
  })

  describe('updateUser enabled-count guard', () => {
    it('should refuse disabling a user that would leave only 1 enabled user', () => {
      expect(() => service.updateUser('bob', { disabled: true })).toThrow(ConflictException)
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('should proceed when confirm is true', () => {
      service.updateUser('bob', { disabled: true }, true)

      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/users.yml.tmp',
        expect.stringContaining('disabled: true'),
        'utf-8',
      )
    })

    it('should not guard when enabling a user', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)

      expect(() => service.updateUser('alice', { disabled: false })).not.toThrow()
    })

    it('should not guard when disabled is omitted from the update', () => {
      expect(() => service.updateUser('bob', { displayname: 'Bobby' })).not.toThrow()
    })

    it('should not guard when the user is already disabled', () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)

      expect(() => service.updateUser('alice', { disabled: true })).not.toThrow()
    })

    it('should not require confirmation when 2+ enabled users remain after disabling', () => {
      readFileSyncMock.mockReturnValue(THREE_ENABLED_USERS_YAML)

      expect(() => service.updateUser('carol', { disabled: true })).not.toThrow()
      expect(writeFileSyncMock).toHaveBeenCalled()
    })
  })

  describe('guarded groups', () => {
    async function createService(configValues: Record<string, string> = {}): Promise<UsersService> {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string, defaultVal?: string) =>
                key === 'AUTHELIA_USERS_FILE'
                  ? '/tmp/users.yml'
                  : (configValues[key] ?? defaultVal)),
            },
          },
          { provide: GroupsService, useValue: mockGroupsService },
          {
            provide: DatabaseService,
            useValue: {
              instance: { prepare: mockPrepare },
            },
          },
        ],
      }).compile()
      return module.get<UsersService>(UsersService)
    }

    describe('oIDC_REQUIRED_GROUP', () => {
      it('refuses disabling the last enabled member, naming the group', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService()

        try {
          svc.updateUser('alice', { disabled: true })
          throw new Error('expected updateUser to throw')
        }
        catch (err) {
          expect(err).toBeInstanceOf(ConflictException)
          expect((err as ConflictException).getResponse()).toEqual(
            expect.objectContaining({
              confirmRequired: true,
              emptiedGroups: ['tegata'],
            }),
          )
        }
        expect(writeFileSyncMock).not.toHaveBeenCalled()
      })

      it('succeeds when confirm is true', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService()

        expect(() => svc.updateUser('alice', { disabled: true }, true)).not.toThrow()
        expect(writeFileSyncMock).toHaveBeenCalled()
      })

      it('refuses deleting the last enabled member', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService()

        expect(() => svc.deleteUser('alice')).toThrow(ConflictException)
      })

      it('refuses a groups update that removes the last enabled member from the group', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService()

        try {
          svc.updateUser('alice', {
            groups: ['admins', 'moderators'],
          })
          throw new Error('expected updateUser to throw')
        }
        catch (err) {
          expect(err).toBeInstanceOf(ConflictException)
          expect((err as ConflictException).getResponse()).toEqual(
            expect.objectContaining({
              confirmRequired: true,
              emptiedGroups: ['tegata'],
            }),
          )
        }
      })

      it('is guarded whether or not GUARDED_GROUPS also lists it', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService({ GUARDED_GROUPS: 'tegata' })

        expect(() => svc.updateUser('alice', { disabled: true })).toThrow(ConflictException)
      })
    })

    describe('gUARDED_GROUPS', () => {
      it('refuses emptying a group listed in GUARDED_GROUPS', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService({ GUARDED_GROUPS: 'admins' })

        try {
          svc.updateUser('alice', { disabled: true })
          throw new Error('expected updateUser to throw')
        }
        catch (err) {
          expect(err).toBeInstanceOf(ConflictException)
          expect((err as ConflictException).getResponse()).toEqual(
            expect.objectContaining({
              confirmRequired: true,
              emptiedGroups: expect.arrayContaining(['admins', 'tegata']),
            }),
          )
        }
      })

      it('never triggers for a group that is neither OIDC_REQUIRED_GROUP nor in GUARDED_GROUPS', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService({ GUARDED_GROUPS: 'admins' })

        // alice is also the sole member of "moderators", which isn't guarded
        expect(() => svc.updateUser('alice', {
          groups: ['admins', 'tegata'],
        })).not.toThrow()
      })

      it('parses a comma list tolerating whitespace, empty entries, and duplicates', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService({ GUARDED_GROUPS: ' admins , , admins ,tegata ' })

        try {
          svc.updateUser('alice', { disabled: true })
          throw new Error('expected updateUser to throw')
        }
        catch (err) {
          const body = (err as ConflictException).getResponse() as { emptiedGroups: string[] }
          expect(body.emptiedGroups.slice().sort()).toEqual(['admins', 'tegata'])
        }
      })

      it('adds no extra guarded groups when unset', async () => {
        readFileSyncMock.mockReturnValue(FOUR_ENABLED_USERS_YAML)
        const svc = await createService()

        expect(() => svc.updateUser('alice', {
          groups: ['tegata', 'moderators'],
        })).not.toThrow()
      })
    })

    it('does not trigger for a Guarded Group that was already empty of enabled members', async () => {
      readFileSyncMock.mockReturnValue(USERS_YAML)
      const svc = await createService({ GUARDED_GROUPS: 'moderators' })

      expect(() => svc.updateUser('alice', { groups: [] })).not.toThrow()
    })

    it('does not trigger when disabling an already-Disabled member of a Guarded Group', async () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)
      const svc = await createService({ GUARDED_GROUPS: 'admins' })

      expect(() => svc.updateUser('alice', { disabled: true })).not.toThrow()
    })

    it('does not trigger when deleting an already-Disabled member of a Guarded Group', async () => {
      readFileSyncMock.mockReturnValue(USERS_YAML_WITH_DISABLED)
      const svc = await createService({ GUARDED_GROUPS: 'admins' })

      expect(() => svc.deleteUser('alice')).not.toThrow()
    })
  })
})
