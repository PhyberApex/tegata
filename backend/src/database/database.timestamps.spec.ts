import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from './database.service'

// Real SQLite, unlike database.service.spec.ts — the rewrite is SQL, and only SQLite can say what it does.
describe('databaseService timestamps', () => {
  let dir: string
  let dbPath: string
  let service: DatabaseService

  function open() {
    service = new DatabaseService({
      get: (key: string, defaultVal?: string) => key === 'TEGATA_DB_PATH'
        ? dbPath
        : defaultVal,
    } as unknown as ConfigService)
    service.onModuleInit()
    return service.instance
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tegata-db-'))
    dbPath = join(dir, 'tegata.db')
  })

  afterEach(() => {
    service?.onModuleDestroy()
    rmSync(dir, { recursive: true, force: true })
  })

  it('should default created_at to an ISO instant on a fresh database', () => {
    const db = open()
    db.prepare('INSERT INTO invites (id, token, expires_at) VALUES (?, ?, ?)').run('i', 't', '2099-01-01T00:00:00.000Z')
    db.prepare('INSERT INTO reset_tokens (id, token, username, expires_at) VALUES (?, ?, ?, ?)').run('r', 't', 'alice', '2099-01-01T00:00:00.000Z')

    for (const table of ['invites', 'reset_tokens']) {
      const { created_at } = db.prepare(`SELECT created_at FROM ${table}`).get() as { created_at: string }
      expect(created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    }
  })

  it('should rewrite rows written by datetime(\'now\') as UTC ISO strings and leave ISO and null ones alone', () => {
    const legacy = new Database(dbPath)
    legacy.exec(`
      CREATE TABLE invites (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, groups TEXT NOT NULL DEFAULT '[]',
        expires_at TEXT NOT NULL, used_by TEXT, used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE reset_tokens (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, username TEXT NOT NULL,
        expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO invites (id, token, expires_at, used_by, used_at, created_at)
        VALUES ('old', 'a', '2099-01-01T00:00:00.000Z', 'bob', '2026-10-31 12:40:00', '2026-10-31 12:34:56');
      INSERT INTO invites (id, token, expires_at, created_at)
        VALUES ('new', 'b', '2099-01-01T00:00:00.000Z', '2026-10-31T12:34:56.789Z');
      INSERT INTO reset_tokens (id, token, username, expires_at, used_at, created_at)
        VALUES ('old', 'a', 'alice', '2099-01-01T00:00:00.000Z', '2026-10-31 12:40:00', '2026-10-31 12:34:56');
    `)
    legacy.close()

    const db = open()

    expect(db.prepare('SELECT id, used_at, created_at FROM invites ORDER BY id').all()).toEqual([
      { id: 'new', used_at: null, created_at: '2026-10-31T12:34:56.789Z' },
      { id: 'old', used_at: '2026-10-31T12:40:00.000Z', created_at: '2026-10-31T12:34:56.000Z' },
    ])
    expect(db.prepare('SELECT used_at, created_at FROM reset_tokens').get()).toEqual({
      used_at: '2026-10-31T12:40:00.000Z',
      created_at: '2026-10-31T12:34:56.000Z',
    })
  })
})
