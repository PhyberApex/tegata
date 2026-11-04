import type { GroupInUseConflict } from '@tegata/shared'
import type { AutheliaUser } from '../users/users.service'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import * as yaml from 'js-yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { UsersService } from '../users/users.service'
import { GroupDeletionService } from './group-deletion.service'
import { GroupsService } from './groups.service'

// Group Deletion end to end, against a real SQLite file and a real users database: the bug it exists for
// only shows on the *next* boot, when Group Seeding reads whatever the delete left behind.
describe('group Deletion', () => {
  let dir: string
  let usersFile: string
  let dbPath: string
  let module: TestingModule | undefined

  function writeUsers(users: Record<string, Partial<AutheliaUser>>): void {
    const full = Object.fromEntries(Object.entries(users).map(([name, user]) => [
      name,
      {
        displayname: name,
        password: '$argon2id$hash',
        email: `${name}@example.com`,
        groups: [],
        ...user,
      },
    ]))
    writeFileSync(usersFile, yaml.dump({ users: full }), 'utf-8')
  }

  function readUsers(): Record<string, AutheliaUser> {
    return (yaml.load(readFileSync(usersFile, 'utf-8')) as { users: Record<string, AutheliaUser> }).users
  }

  /** A fresh boot of the services on the same two files — `init()` runs Group Seeding. */
  async function boot(): Promise<{ groups: GroupsService, deletion: GroupDeletionService, db: DatabaseService }> {
    await module?.close()
    module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        GroupsService,
        UsersService,
        GroupDeletionService,
        {
          provide: ConfigService,
          useValue: new ConfigService({ TEGATA_DB_PATH: dbPath, AUTHELIA_USERS_FILE: usersFile, OIDC_REQUIRED_GROUP: 'tegata' }),
        },
      ],
    }).compile()
    await module.init()
    return {
      groups: module.get(GroupsService),
      deletion: module.get(GroupDeletionService),
      db: module.get(DatabaseService),
    }
  }

  function conflictOf(fn: () => void): GroupInUseConflict {
    try {
      fn()
    }
    catch (err) {
      expect(err).toBeInstanceOf(ConflictException)
      return (err as ConflictException).getResponse() as GroupInUseConflict
    }
    throw new Error('expected a 409')
  }

  function insertInvite(db: DatabaseService, id: string, groups: string[], opts: { usedBy?: string, expiresAt?: string } = {}): void {
    db.instance
      .prepare('INSERT INTO invites (id, token, groups, expires_at, email, used_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, `token-${id}`, JSON.stringify(groups), opts.expiresAt ?? new Date(Date.now() + 86_400_000).toISOString(), `${id}@example.com`, opts.usedBy ?? null)
  }

  function inviteGroups(db: DatabaseService, id: string): string[] {
    return JSON.parse((db.instance.prepare('SELECT groups FROM invites WHERE id = ?').get(id) as { groups: string }).groups)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tegata-group-deletion-'))
    usersFile = join(dir, 'users_database.yml')
    dbPath = join(dir, 'tegata.db')
  })

  afterEach(async () => {
    await module?.close()
    module = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses while a user is a member, naming them', async () => {
    writeUsers({
      alice: {
        groups: ['media', 'tegata'],
      },
      bob: {
        groups: ['tegata'],
      },
    })
    const { groups, deletion } = await boot()

    const body = conflictOf(() => deletion.deleteGroup('media'))

    expect(body).toMatchObject({
      confirmRequired: true,
      members: ['alice'],
      invites: [],
      bundles: [],
      emptiedGroups: [],
    })
    expect(body.message).toContain('1 user')
    expect(groups.getGroupNames()).toContain('media')
    expect(readUsers().alice.groups).toEqual(['media', 'tegata'])
  })

  it('on confirm strips the group from every member, and the next boot does not re-seed it', async () => {
    writeUsers({
      alice: {
        groups: ['media', 'tegata'],
      },
      bob: {
        groups: ['tegata'],
      },
      carol: {
        groups: ['media'],
        disabled: true,
      },
    })
    const { groups, deletion } = await boot()

    deletion.deleteGroup('media', true)

    const users = readUsers()
    expect(users.alice.groups).toEqual(['tegata'])
    expect(users.bob.groups).toEqual(['tegata'])
    expect(users.carol.groups).toEqual([])
    expect(groups.getGroupNames()).not.toContain('media')

    const rebooted = await boot()
    expect(rebooted.groups.getGroupNames()).toEqual(['tegata'])
  })

  it('treats a group a pending invite names the same way, and leaves used or expired invites alone', async () => {
    writeUsers({
      alice: {
        groups: ['tegata'],
      },
    })
    const { groups, deletion, db } = await boot()
    groups.createGroup('media')
    insertInvite(db, 'pending', ['media', 'tegata'])
    insertInvite(db, 'used', ['media'], { usedBy: 'someone' })
    insertInvite(db, 'expired', ['media'], {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })

    const body = conflictOf(() => deletion.deleteGroup('media'))
    expect(body).toMatchObject({
      members: [],
      invites: [
        { id: 'pending', email: 'pending@example.com' },
      ],
      bundles: [],
    })
    expect(body.message).toContain('1 pending invite')

    deletion.deleteGroup('media', true)

    expect(inviteGroups(db, 'pending')).toEqual(['tegata'])
    expect(inviteGroups(db, 'used')).toEqual(['media'])
    expect(inviteGroups(db, 'expired')).toEqual(['media'])
    expect(groups.getGroupNames()).not.toContain('media')
  })

  it('treats a group a bundle names the same way', async () => {
    writeUsers({
      alice: {
        groups: ['tegata'],
      },
    })
    const { groups, deletion, db } = await boot()
    groups.createGroup('media')
    db.instance.prepare('INSERT INTO bundles (name, groups) VALUES (?, ?)').run('family', JSON.stringify(['media', 'tegata']))
    db.instance.prepare('INSERT INTO bundles (name, groups) VALUES (?, ?)').run('ops', JSON.stringify(['tegata']))

    const body = conflictOf(() => deletion.deleteGroup('media'))
    expect(body).toMatchObject({
      members: [],
      invites: [],
      bundles: ['family'],
    })
    expect(body.message).toContain('1 bundle')

    deletion.deleteGroup('media', true)

    const family = db.instance.prepare('SELECT groups FROM bundles WHERE name = ?').get('family') as { groups: string }
    expect(JSON.parse(family.groups)).toEqual(['tegata'])
    expect(groups.getGroupNames()).not.toContain('media')
  })

  it('names a Guarded Group the delete would empty, and confirm overrides it', async () => {
    writeUsers({
      alice: {
        groups: ['tegata'],
      },
      bob: { groups: [] },
    })
    const { deletion } = await boot()

    const body = conflictOf(() => deletion.deleteGroup('tegata'))
    expect(body.emptiedGroups).toEqual(['tegata'])
    expect(body.message).toContain('This would leave no enabled members in tegata')

    deletion.deleteGroup('tegata', true)
    expect(readUsers().alice.groups).toEqual([])
  })

  it('deletes a group nothing names without a confirm, and leaves the users database untouched', async () => {
    writeUsers({
      alice: {
        groups: ['tegata'],
      },
    })
    const { groups, deletion } = await boot()
    groups.createGroup('unused')
    const before = readFileSync(usersFile, 'utf-8')

    deletion.deleteGroup('unused')

    expect(groups.getGroupNames()).not.toContain('unused')
    expect(readFileSync(usersFile, 'utf-8')).toBe(before)
  })

  it('refuses with a 503 and keeps the row when the users database is unreadable', async () => {
    writeUsers({
      alice: {
        groups: ['media'],
      },
    })
    const { groups, deletion } = await boot()
    writeFileSync(usersFile, 'not: [valid', 'utf-8')

    expect(() => deletion.deleteGroup('media', true)).toThrow(ServiceUnavailableException)
    expect(groups.getGroupNames()).toContain('media')
  })
})
