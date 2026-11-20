import type { TestingModule } from '@nestjs/testing'
import type { Mocked } from 'vitest'
import { readFileSync } from 'node:fs'
import { HttpException, HttpStatus, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from '../groups/groups.service'
import { UsersService } from '../users/users.service'
import { HealthController } from './health.controller'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
  }
})

const mockReadFileSync = vi.mocked(readFileSync)

const USERS_FILE = '/authelia-config/users_database.yml'

function enoent(): never {
  const err = new Error(`ENOENT: no such file or directory, open '${USERS_FILE}'`) as NodeJS.ErrnoException
  err.code = 'ENOENT'
  throw err
}

function expectUnhealthy(controller: HealthController): Record<string, unknown> {
  try {
    controller.check()
  }
  catch (error) {
    expect(error).toBeInstanceOf(HttpException)
    const httpError = error as HttpException
    expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
    const response = httpError.getResponse() as Record<string, unknown>
    expect(response.status).toBe('unhealthy')
    return response
  }
  throw new Error('expected check() to throw')
}

describe('healthController', () => {
  let controller: HealthController
  let dbService: Mocked<DatabaseService>
  let integrityRow: { baseline_hash: string, mismatch_detected: number } | undefined
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    integrityRow = undefined
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        UsersService,
        {
          provide: DatabaseService,
          useValue: {
            instance: {
              open: true,
              prepare: vi.fn(() => ({
                get: () => integrityRow,
                run: vi.fn(),
              })),
            },
          },
        },
        {
          provide: GroupsService,
          useValue: {
            ensureGroup: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string, fallback?: string) => key === 'AUTHELIA_USERS_FILE'
              ? USERS_FILE
              : fallback),
          },
        },
      ],
    }).compile()

    controller = module.get(HealthController)
    dbService = module.get(DatabaseService) as Mocked<DatabaseService>

    mockReadFileSync.mockImplementation(enoent)
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('reports ok when the database is open and the users file is missing with no baseline recorded', () => {
    expect(controller.check()).toEqual({ status: 'ok', database: true, usersDatabase: true })
  })

  it('reports ok when the users file exists and parses to a users mapping', () => {
    mockReadFileSync.mockReturnValue('users:\n  alice:\n    displayname: Alice\n')

    expect(controller.check()).toEqual({ status: 'ok', database: true, usersDatabase: true })
  })

  it('fails with 503 when the users file is zero bytes', () => {
    mockReadFileSync.mockReturnValue('')

    const response = expectUnhealthy(controller)
    expect(response.database).toBe(true)
    expect(response.usersDatabase).toBe(false)
  })

  it('fails with 503 when the users file parses but has no users mapping', () => {
    mockReadFileSync.mockReturnValue('groups:\n  - admins\n')

    const response = expectUnhealthy(controller)
    expect(response.usersDatabase).toBe(false)
  })

  it('fails with 503 when the users file is missing after a Baseline Hash was recorded', () => {
    integrityRow = { baseline_hash: 'abc', mismatch_detected: 0 }

    const response = expectUnhealthy(controller)
    expect(response.usersDatabase).toBe(false)
  })

  function closeSqlite() {
    Object.defineProperty(dbService, 'instance', {
      value: {
        open: false,
        prepare: vi.fn(() => {
          throw new TypeError('The database connection is not open')
        }),
      },
    })
  }

  it('fails with 503 when the SQLite handle is closed', () => {
    closeSqlite()
    mockReadFileSync.mockReturnValue('users:\n  alice:\n    displayname: Alice\n')

    const response = expectUnhealthy(controller)
    expect(response.database).toBe(false)
    expect(response.usersDatabase).toBe(true)
    expect(response.reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/database/i),
    ]))
  })

  it('fails with 503 without leaking the file path when the users file cannot be read', () => {
    mockReadFileSync.mockImplementation(() => {
      const err = new Error(`EACCES: permission denied, open '${USERS_FILE}'`) as NodeJS.ErrnoException
      err.code = 'EACCES'
      throw err
    })

    const response = expectUnhealthy(controller)
    expect(response.database).toBe(true)
    expect(response.usersDatabase).toBe(false)
    expect(response.reasons).toEqual([
      expect.stringMatching(/read/i),
    ])
    expect(JSON.stringify(response)).not.toContain(USERS_FILE)
    expect(JSON.stringify(response)).not.toContain('EACCES')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('EACCES'))
  })

  it('fails with 503 without leaking file content when the users file fails to YAML-parse', () => {
    const content = [
      'users:',
      '  alice:',
      '    password: "$argon2id$v=19$m=65536,t=3,p=4$secrethashprefix"',
      '    email: alice@example.com',
      '   bad: [',
    ].join('\n')
    mockReadFileSync.mockReturnValue(content)

    const response = expectUnhealthy(controller)
    expect(response.database).toBe(true)
    expect(response.usersDatabase).toBe(false)
    expect(response.reasons).toEqual([
      expect.stringMatching(/yaml/i),
    ])
    const body = JSON.stringify(response)
    for (const line of content.split('\n'))
      expect(body).not.toContain(line.trim())
    expect(body).not.toContain('alice')
    expect(body).not.toContain(USERS_FILE)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('alice@example.com'))
  })

  it('answers 503 rather than crashing when the SQLite handle is closed and the users file is missing', () => {
    closeSqlite()

    const response = expectUnhealthy(controller)
    expect(response.database).toBe(false)
    expect(response.usersDatabase).toBe(false)
    expect(JSON.stringify(response)).not.toContain('not open')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not open'))
  })

  it('reports both subsystems as unhealthy with distinct reasons when both fail', () => {
    closeSqlite()
    mockReadFileSync.mockReturnValue('users: [this is not: valid: yaml')

    const response = expectUnhealthy(controller)
    expect(response.database).toBe(false)
    expect(response.usersDatabase).toBe(false)
    expect(response.reasons).toHaveLength(2)
  })
})
