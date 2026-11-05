import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from '../groups/groups.service'
import { UsersService } from './users.service'

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('$argon2id$mocked-hash'),
  verify: vi.fn().mockResolvedValue(true),
  argon2id: 2,
}))

const mode = (path: string) => statSync(path).mode & 0o777

describe('usersService file permissions (real filesystem)', () => {
  let dir: string
  let file: string
  let service: UsersService

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tegata-users-'))
    file = join(dir, 'users_database.yml')

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: string) => key === 'AUTHELIA_USERS_FILE'
              ? file
              : def,
          },
        },
        {
          provide: GroupsService,
          useValue: {
            ensureGroup: vi.fn(),
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            instance: {
              prepare: () => ({
                run: vi.fn(),
                get: vi.fn(),
                all: vi.fn(),
              }),
            },
          },
        },
      ],
    }).compile()
    service = module.get(UsersService)
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates the file 0600 on a fresh install, regardless of umask', async () => {
    const previous = process.umask(0o022)
    try {
      await service.createUser('alice', 'Alice', 'alice@test.com', 'password123', ['users'])
    }
    finally {
      process.umask(previous)
    }

    expect(mode(file)).toBe(0o600)
    expect(readdirSync(dir)).toEqual(['users_database.yml'])
  })

  it('keeps the mode of an existing file', async () => {
    writeFileSync(file, 'users: {}\n')
    chmodSync(file, 0o640)

    await service.createUser('alice', 'Alice', 'alice@test.com', 'password123', ['users'])

    expect(mode(file)).toBe(0o640)
  })
})
