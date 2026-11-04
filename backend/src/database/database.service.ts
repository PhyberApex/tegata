import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Database from 'better-sqlite3'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: Database.Database

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const dbPath = this.config.get<string>('TEGATA_DB_PATH', '/data/tegata.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    // Retry internally on SQLITE_BUSY instead of throwing immediately — a transient lock
    // contention shouldn't make writeDatabase()'s baseline-hash bookkeeping fail and falsely
    // flag Tegata's own write as an out-of-band edit on the next read.
    this.db.pragma('busy_timeout = 5000')
    this.migrate()
  }

  onModuleDestroy() {
    this.db.close()
  }

  get instance(): Database.Database {
    return this.db
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invites (
        id TEXT PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        groups TEXT NOT NULL DEFAULT '[]',
        expires_at TEXT NOT NULL,
        email TEXT,
        displayname TEXT,
        used_by TEXT,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS groups (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS bundles (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        groups TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS reset_tokens (
        id TEXT PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS users_database_integrity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        baseline_hash TEXT NOT NULL,
        mismatch_detected INTEGER NOT NULL DEFAULT 0
      )
    `)

    this.ensureColumn('invites', 'email', 'TEXT')
    this.ensureColumn('invites', 'displayname', 'TEXT')
    this.ensureColumn('invites', 'bundle_name', 'TEXT')
    this.ensureColumn('invites', 'email_sent_at', 'TEXT')
    this.ensureColumn('invites', 'email_error', 'TEXT')
    this.ensureColumn('reset_tokens', 'email_sent_at', 'TEXT')
    this.ensureColumn('reset_tokens', 'email_error', 'TEXT')

    for (const table of ['invites', 'reset_tokens']) {
      for (const column of ['created_at', 'used_at'])
        this.normaliseTimestamps(table, column)
    }
  }

  /**
   * Rows from before every write went through `toISOString()` hold SQLite's `datetime('now')` shape — UTC with
   * no zone marker, which a browser parses as local time. Rewritten in place as the same instant in ISO form.
   * `expires_at` and `email_sent_at` were always ISO, so only these two columns need it; an ISO row never matches.
   * Existing tables keep their old `datetime('now')` column default, so the services write these columns themselves.
   */
  private normaliseTimestamps(table: string, column: string) {
    this.db.exec(`
      UPDATE ${table} SET ${column} = strftime('%Y-%m-%dT%H:%M:%fZ', ${column})
      WHERE ${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]'
    `)
  }

  /** CREATE TABLE IF NOT EXISTS won't extend tables that predate a column — backfill it via ALTER. */
  private ensureColumn(table: string, column: string, type: string) {
    const columns = this.db.pragma(`table_info(${table})`) as { name: string }[]
    if (!columns.some(c => c.name === column))
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}
