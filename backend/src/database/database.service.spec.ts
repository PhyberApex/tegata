import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from './database.service'

const databaseMock = vi.hoisted(() => {
  const mockDb = {
    pragma: vi.fn((): unknown[] => []),
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

describe('databaseService', () => {
  let service: DatabaseService
  let mockDatabase: typeof databaseMock.mockDb

  beforeEach(async () => {
    databaseMock.ctor.mockClear()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string, defaultVal: string) => {
              if (key === 'TEGATA_DB_PATH')
                return '/tmp/test-tegata.db'
              return defaultVal
            }),
          },
        },
      ],
    }).compile()

    service = module.get<DatabaseService>(DatabaseService)
    service.onModuleInit()
    mockDatabase = databaseMock.ctor()
  })

  describe('onModuleInit', () => {
    it('should fail with a readable message naming the path and the uid hint when the file cannot be opened', () => {
      databaseMock.ctor.mockImplementationOnce(() => {
        throw new Error('unable to open database file')
      })
      expect(() => service.onModuleInit()).toThrow(/Cannot open the Tegata database at \/tmp\/test-tegata\.db.*unable to open database file.*writable by the uid/s)
    })

    it('should open database with configured path', () => {
      expect(databaseMock.ctor).toHaveBeenCalledWith('/tmp/test-tegata.db')
    })

    it('should set WAL journal mode', () => {
      expect(mockDatabase.pragma).toHaveBeenCalledWith('journal_mode = WAL')
    })

    it('should set a busy timeout so transient lock contention retries instead of throwing', () => {
      expect(mockDatabase.pragma).toHaveBeenCalledWith('busy_timeout = 5000')
    })

    it('should run migration to create invites table', () => {
      expect(mockDatabase.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS invites'),
      )
    })

    it('should run migration to create groups table', () => {
      expect(mockDatabase.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS groups'),
      )
    })

    it('should run migration to create reset_tokens table', () => {
      expect(mockDatabase.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS reset_tokens'),
      )
    })

    it('should run migration to create bundles table', () => {
      expect(mockDatabase.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS bundles'),
      )
    })

    it('should run migration to create users_database_integrity table', () => {
      expect(mockDatabase.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS users_database_integrity'),
      )
    })

    it('should add missing email, displayname and bundle_name columns to an existing invites table', () => {
      expect(mockDatabase.exec).toHaveBeenCalledWith('ALTER TABLE invites ADD COLUMN email TEXT')
      expect(mockDatabase.exec).toHaveBeenCalledWith('ALTER TABLE invites ADD COLUMN displayname TEXT')
      expect(mockDatabase.exec).toHaveBeenCalledWith('ALTER TABLE invites ADD COLUMN bundle_name TEXT')
    })

    it('should add missing email delivery-status columns to invites and reset_tokens', () => {
      expect(mockDatabase.exec).toHaveBeenCalledWith('ALTER TABLE invites ADD COLUMN email_sent_at TEXT')
      expect(mockDatabase.exec).toHaveBeenCalledWith('ALTER TABLE invites ADD COLUMN email_error TEXT')
      expect(mockDatabase.exec).toHaveBeenCalledWith('ALTER TABLE reset_tokens ADD COLUMN email_sent_at TEXT')
      expect(mockDatabase.exec).toHaveBeenCalledWith('ALTER TABLE reset_tokens ADD COLUMN email_error TEXT')
    })

    it('should not add columns the invites table already has', () => {
      mockDatabase.pragma.mockReturnValue([
        { name: 'email' },
        { name: 'displayname' },
        { name: 'bundle_name' },
      ])
      mockDatabase.exec.mockClear()

      service.onModuleInit()

      expect(mockDatabase.exec).not.toHaveBeenCalledWith('ALTER TABLE invites ADD COLUMN email TEXT')
      expect(mockDatabase.exec).not.toHaveBeenCalledWith('ALTER TABLE invites ADD COLUMN displayname TEXT')
      expect(mockDatabase.exec).not.toHaveBeenCalledWith('ALTER TABLE invites ADD COLUMN bundle_name TEXT')
    })
  })

  describe('instance', () => {
    it('should return the database instance', () => {
      expect(service.instance).toBeDefined()
    })
  })

  describe('onModuleDestroy', () => {
    it('should close the database', () => {
      service.onModuleDestroy()
      expect(mockDatabase.close).toHaveBeenCalled()
    })
  })
})
