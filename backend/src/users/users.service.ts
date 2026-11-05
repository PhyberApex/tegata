import { createHash } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as argon2 from 'argon2'
import * as yaml from 'js-yaml'
import { parseArgon2Options } from '../config/argon2-options'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from '../groups/groups.service'
import { getGuardedGroups } from './guarded-groups'

export interface AutheliaUser {
  displayname: string
  password: string
  email: string
  groups: string[]
  disabled?: boolean
}

interface UsersDatabase {
  users: Record<string, AutheliaUser>
}

/** Own-key lookup: usernames like `constructor` or `__proto__` must not resolve to Object.prototype members. */
function lookupUser(users: Record<string, AutheliaUser>, username: string): AutheliaUser | undefined {
  return Object.hasOwn(users, username)
    ? users[username]
    : undefined
}

/**
 * The Unreadable Users Database state (CONTEXT.md): a missing file only counts as "start empty" before any
 * Baseline Hash has ever been recorded (fresh install). Once a row exists, a missing file is unreadable just
 * like a permission error, a parse failure, or a file that parses without a `users` mapping.
 */
type DatabaseReadResult
  = | { readable: true, db: UsersDatabase }
    | { readable: false, reason: string }

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly filePath: string
  private readonly guardedGroups: string[]
  private readonly logger = new Logger(UsersService.name)

  private readonly argon2Options: argon2.HashOptions

  constructor(
    private config: ConfigService,
    private groupsService: GroupsService,
    private db: DatabaseService,
  ) {
    this.filePath = this.config.get<string>(
      'AUTHELIA_USERS_FILE',
      '/authelia-config/users_database.yml',
    )
    this.guardedGroups = getGuardedGroups(this.config)
    this.argon2Options = parseArgon2Options(key => this.config.get<string>(key))
  }

  onModuleInit() {
    const db = this.readDatabase()
    const allGroups = new Set<string>()
    for (const user of Object.values(db.users)) {
      for (const group of user.groups ?? [])
        allGroups.add(group)
    }
    for (const group of allGroups)
      this.groupsService.ensureGroup(group)
    this.logger.log(`Seeded ${allGroups.size} groups from users database`)
  }

  private checkReadability(): DatabaseReadResult {
    let content: string
    try {
      content = readFileSync(this.filePath, 'utf-8')
    }
    catch (err) {
      return this.readErrorResult(err)
    }
    return this.parseDatabaseContent(content)
  }

  private readErrorResult(err: unknown): DatabaseReadResult {
    const isEnoent = err instanceof Error && 'code' in err && err.code === 'ENOENT'
    if (!isEnoent)
      return { readable: false, reason: `The users database file could not be read: ${err}` }

    // A Baseline Hash already recorded means the database was live before and is now gone —
    // that's the same risky shape as a parse failure, not the fresh-install case.
    if (this.getIntegrityRow())
      return { readable: false, reason: 'The users database file is missing' }
    return {
      readable: true,
      db: { users: {} },
    }
  }

  private parseDatabaseContent(content: string): DatabaseReadResult {
    let parsed: unknown
    try {
      parsed = yaml.load(content)
    }
    catch (err) {
      return { readable: false, reason: `The users database file could not be parsed: ${err}` }
    }

    const db = parsed as UsersDatabase | null
    if (!db || typeof db.users !== 'object' || db.users === null || Array.isArray(db.users))
      return { readable: false, reason: 'The users database file does not contain a valid users mapping' }

    return { readable: true, db }
  }

  private readabilityResult(): DatabaseReadResult {
    this.detectOutOfBandEdit()
    return this.checkReadability()
  }

  /** Tolerant read for surfaces that must keep working against whatever could be read: listing, lookups, boot seeding. */
  private readDatabase(): UsersDatabase {
    const result = this.readabilityResult()
    if (!result.readable) {
      this.logger.warn(`Could not read users database, starting empty: ${result.reason}`)
      return { users: {} }
    }
    return result.db
  }

  /**
   * The single guard every mutating method (and every precondition check ahead of one) goes through —
   * refuses with a 503 instead of letting a write silently replace the real file with an empty map.
   */
  private readDatabaseOrThrow(): UsersDatabase {
    const result = this.readabilityResult()
    if (!result.readable)
      throw new ServiceUnavailableException(result.reason)
    return result.db
  }

  /**
   * The one read-modify-write of the users database every mutator goes through — the async ones only after
   * their `await` (the argon2 hash) has finished. The callback is synchronous, so nothing else runs on the
   * event loop between this read and its write: an overlapping mutation either lands before the read and is
   * seen, or starts after the write and re-reads — never writes back a map missing the other's change. A
   * callback that throws writes nothing.
   */
  private mutateDatabase<T>(mutate: (db: UsersDatabase) => T): T {
    const db = this.readDatabaseOrThrow()
    const result = mutate(db)
    this.writeDatabase(db)
    return result
  }

  private assertUsernameFree(db: UsersDatabase, username: string): void {
    if (lookupUser(db.users, username))
      throw new ConflictException(`User "${username}" already exists`)
  }

  private findUserOrThrow(db: UsersDatabase, username: string): AutheliaUser {
    const user = lookupUser(db.users, username)
    if (!user)
      throw new NotFoundException(`User "${username}" not found`)
    return user
  }

  private writeDatabase(db: UsersDatabase) {
    const header = [
      '# Authelia Users Database',
      '# Managed by Tegata - Do not edit manually',
      '---',
    ].join('\n')

    const content = `${header}\n${yaml.dump(db, { lineWidth: -1, quoteStyle: 'double' })}`

    // Write-then-rename keeps the swap atomic so Authelia's file watcher never reloads a partial file
    const tmpPath = `${this.filePath}.tmp`
    // 0600 at creation so the argon2 hashes are never readable by others, even briefly or on a fresh install
    writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 })
    if (existsSync(this.filePath))
      chmodSync(tmpPath, statSync(this.filePath).mode & 0o777)
    renameSync(tmpPath, this.filePath)

    // The YAML write already succeeded and Authelia will pick it up regardless — a failure recording
    // the baseline is a bookkeeping problem, not a reason to report the whole operation as failed.
    try {
      this.recordBaselineHash(this.hashContent(content))
    }
    catch (err) {
      this.logger.warn(`Could not record baseline hash after write: ${err}`)
    }
    this.logger.log('Users database written')
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex')
  }

  /** `null` for any read failure; `missing` tells a plain ENOENT apart from other errors. */
  private readRawFile(): { content: string | null, missing: boolean } {
    try {
      return {
        content: readFileSync(this.filePath, 'utf-8'),
        missing: false,
      }
    }
    catch (err) {
      const missing = err instanceof Error && 'code' in err && err.code === 'ENOENT'
      return { content: null, missing }
    }
  }

  private getIntegrityRow(): { baseline_hash: string, mismatch_detected: number } | undefined {
    return this.db.instance
      .prepare('SELECT baseline_hash, mismatch_detected FROM users_database_integrity WHERE id = 1')
      .get() as { baseline_hash: string, mismatch_detected: number } | undefined
  }

  /**
   * Records the hash of what Tegata itself just wrote, preserving any pending Out-of-Band Edit flag —
   * a write that lands on top of unacknowledged tampering must not silently erase the evidence.
   */
  private recordBaselineHash(hash: string): void {
    this.db.instance
      .prepare(`
        INSERT INTO users_database_integrity (id, baseline_hash, mismatch_detected)
        VALUES (1, ?, 0)
        ON CONFLICT(id) DO UPDATE SET baseline_hash = excluded.baseline_hash
      `)
      .run(hash)
  }

  /** Sets the baseline to the current on-disk hash and clears any pending Out-of-Band Edit flag. */
  private acceptBaselineHash(hash: string): void {
    this.db.instance
      .prepare(`
        INSERT INTO users_database_integrity (id, baseline_hash, mismatch_detected)
        VALUES (1, ?, 0)
        ON CONFLICT(id) DO UPDATE SET baseline_hash = excluded.baseline_hash, mismatch_detected = 0
      `)
      .run(hash)
  }

  /**
   * Runs on every readDatabase() call per ADR-0001, not just the status endpoint's poll — a write that
   * follows a tampered read must not be the only chance to notice it. A hit sets a sticky flag that
   * survives Tegata's own next write; only Accept Baseline clears it.
   */
  private detectOutOfBandEdit(): boolean {
    const row = this.getIntegrityRow()
    if (!row) {
      // Fresh install: no baseline and no file is the documented "start empty" state, not tampering.
      // A file that exists without a baseline (post-upgrade seeding) still needs acknowledging.
      return !this.readRawFile().missing
    }
    if (row.mismatch_detected)
      return true

    const { content: current } = this.readRawFile()
    if (current === null)
      return true

    if (this.hashContent(current) !== row.baseline_hash) {
      this.db.instance
        .prepare('UPDATE users_database_integrity SET mismatch_detected = 1 WHERE id = 1')
        .run()
      this.logger.warn('Out-of-band edit detected on the Authelia Users Database')
      return true
    }

    return false
  }

  getDatabaseIntegrityStatus(): { matches: boolean, unreadable: boolean, unreadableReason: string | null } {
    const matches = !this.detectOutOfBandEdit()
    const readability = this.checkReadability()
    return {
      matches,
      unreadable: !readability.readable,
      unreadableReason: readability.readable ? null : readability.reason,
    }
  }

  acceptDatabaseBaseline(): void {
    const { content: current, missing } = this.readRawFile()
    // Nothing to baseline on a fresh install; the first write records one.
    if (missing && !this.getIntegrityRow())
      return
    if (current === null)
      throw new NotFoundException('Users database file could not be read')
    this.acceptBaselineHash(this.hashContent(current))
  }

  private countEnabledUsers(users: Record<string, AutheliaUser>): number {
    return Object.values(users).filter(user => !user.disabled).length
  }

  private countEnabledGroupMembers(users: Record<string, AutheliaUser>, group: string): number {
    return Object.values(users).filter(user => !user.disabled && (user.groups ?? []).includes(group)).length
  }

  /** Guarded Groups that `before` has ≥1 enabled member of but `after` has none — never a group already empty. */
  private computeEmptiedGroups(before: Record<string, AutheliaUser>, after: Record<string, AutheliaUser>): string[] {
    return this.guardedGroups.filter(group =>
      this.countEnabledGroupMembers(before, group) > 0 && this.countEnabledGroupMembers(after, group) === 0,
    )
  }

  /** Applies a hypothetical update to one user without touching the real database, for guard checks. */
  private withUpdatedUser(
    users: Record<string, AutheliaUser>,
    username: string,
    updates: { disabled?: boolean, groups?: string[] },
  ): Record<string, AutheliaUser> {
    return {
      ...users,
      [username]: {
        ...lookupUser(users, username)!,
        ...updates,
      },
    }
  }

  /**
   * Blocks a write that would drop the enabled-user count to 0 or 1, or empty a Guarded Group of its last
   * enabled member, per ADR-0001 — unlike Out-of-Band Edit detection, this guards a state that hasn't
   * happened yet, so it's allowed to actively refuse (pending a `confirm: true` retry). `checkCount` scopes
   * the total-count condition to disabling writes only — a plain groups edit never trips it.
   */
  private assertEnabledCountGuard(
    before: Record<string, AutheliaUser>,
    after: Record<string, AutheliaUser>,
    checkCount: boolean,
    confirm: boolean,
  ): void {
    const resultingCount = this.countEnabledUsers(after)
    const emptiedGroups = this.computeEmptiedGroups(before, after)
    const countTriggered = checkCount && resultingCount <= 1
    if ((!countTriggered && emptiedGroups.length === 0) || confirm)
      return

    const messages: string[] = []
    if (countTriggered) {
      messages.push(`This would leave only ${resultingCount} enabled user${resultingCount === 1
        ? ''
        : 's'}`)
    }
    if (emptiedGroups.length > 0)
      messages.push(`This would leave no enabled members in ${emptiedGroups.join(', ')}`)

    throw new ConflictException({
      message: messages.join('. '),
      confirmRequired: true,
      enabledCount: resultingCount,
      emptiedGroups,
    })
  }

  private toPublicUser(username: string, user: AutheliaUser): { username: string, displayname: string, email: string, groups: string[], disabled: boolean } {
    return {
      username,
      displayname: user.displayname,
      email: user.email,
      groups: user.groups ?? [],
      disabled: user.disabled ?? false,
    }
  }

  listUsers(): Array<{ username: string, displayname: string, email: string, groups: string[], disabled: boolean }> {
    const db = this.readDatabase()
    return Object.entries(db.users).map(([username, user]) => this.toPublicUser(username, user))
  }

  /**
   * Throws instead of reporting "not found" when the database is unreadable — callers use this to gate a
   * write (e.g. Reset Token redemption), and "user no longer exists" would be misleading in that state.
   */
  userExists(username: string): boolean {
    return Boolean(lookupUser(this.readDatabaseOrThrow().users, username))
  }

  /**
   * Whether `username` may still act on its own account: present in the users database and Enabled.
   * Throws when the database is unreadable, for the same reason as `userExists` — a live session should
   * see a 503, not be told its account is gone.
   */
  isEnabledUser(username: string): boolean {
    const user = lookupUser(this.readDatabaseOrThrow().users, username)
    return user !== undefined && !user.disabled
  }

  getUser(username: string): { username: string, displayname: string, email: string, groups: string[], disabled: boolean } | null {
    const user = lookupUser(this.readDatabase().users, username)
    return user
      ? this.toPublicUser(username, user)
      : null
  }

  async createUser(
    username: string,
    displayname: string,
    email: string,
    password: string,
    groups: string[],
  ) {
    // Refused before the hash so a taken username costs no argon2 run; re-checked under the mutation below,
    // since another create may have taken it while this one was hashing.
    this.assertUsernameFree(this.readDatabaseOrThrow(), username)

    for (const group of groups)
      this.groupsService.ensureGroup(group)

    const passwordHash = await argon2.hash(password, this.argon2Options)

    this.mutateDatabase((db) => {
      this.assertUsernameFree(db, username)
      // defineProperty, not assignment: `db.users['__proto__'] = …` would swap the prototype instead.
      Object.defineProperty(db.users, username, {
        value: {
          displayname,
          password: passwordHash,
          email,
          groups,
        },
        enumerable: true,
        writable: true,
        configurable: true,
      })
    })
    this.logger.debug(`User created: ${username} (groups: ${groups.join(', ')})`)
    return { username, displayname, email, groups }
  }

  /** Runs the Enabled-Count Guard against `updates` before anything is mutated, when it's actually at stake. */
  private assertUpdateGuard(
    db: UsersDatabase,
    username: string,
    user: AutheliaUser,
    updates: { groups?: string[], disabled?: boolean },
    confirm: boolean,
  ): void {
    const willDisable = updates.disabled === true && !user.disabled
    if (!willDisable && updates.groups === undefined)
      return

    const resultingUsers = this.withUpdatedUser(db.users, username, {
      ...willDisable
        ? { disabled: true }
        : {},
      ...updates.groups !== undefined
        ? { groups: updates.groups }
        : {},
    })
    this.assertEnabledCountGuard(db.users, resultingUsers, willDisable, confirm)
  }

  private applyUserUpdates(
    user: AutheliaUser,
    updates: { displayname?: string, email?: string, groups?: string[], disabled?: boolean },
  ): void {
    if (updates.displayname !== undefined)
      user.displayname = updates.displayname
    if (updates.email !== undefined)
      user.email = updates.email
    if (updates.groups !== undefined)
      user.groups = updates.groups
    if (updates.disabled !== undefined) {
      if (updates.disabled)
        user.disabled = true
      else
        delete user.disabled
    }
  }

  updateUser(
    username: string,
    updates: { displayname?: string, email?: string, groups?: string[], disabled?: boolean },
    confirm = false,
  ) {
    const user = this.mutateDatabase((db) => {
      const user = this.findUserOrThrow(db, username)
      this.assertUpdateGuard(db, username, user, updates, confirm)

      if (updates.groups !== undefined) {
        for (const group of updates.groups)
          this.groupsService.ensureGroup(group)
      }

      this.applyUserUpdates(user, updates)
      return user
    })
    this.logger.debug(`User updated: ${username}`)
    return {
      username,
      displayname: user.displayname,
      email: user.email,
      groups: user.groups,
      disabled: user.disabled ?? false,
    }
  }

  /** Every user with `group` taken out of their `groups` — a copy, for the guard check and the write alike. */
  private withoutGroup(users: Record<string, AutheliaUser>, group: string): Record<string, AutheliaUser> {
    return Object.fromEntries(Object.entries(users).map(([username, user]) => [
      username,
      user.groups?.includes(group)
        ? {
            ...user,
            groups: user.groups.filter(g => g !== group),
          }
        : user,
    ]))
  }

  /**
   * What Group Deletion would do to the users database: every user still carrying `group` (disabled ones
   * too — Group Seeding reads them all) and the Guarded Groups stripping it would empty. Throws on an
   * unreadable database rather than reading it as "no members", which would let the delete through only for
   * Group Seeding to bring the group back once the file is readable again.
   */
  previewGroupRemoval(group: string): { members: string[], emptiedGroups: string[] } {
    const users = this.readDatabaseOrThrow().users
    return {
      members: Object.keys(users).filter(username => lookupUser(users, username)?.groups?.includes(group)).sort(),
      emptiedGroups: this.computeEmptiedGroups(users, this.withoutGroup(users, group)),
    }
  }

  /** Group Deletion's users-database half: one write taking `group` off every user, behind the Enabled-Count Guard. */
  removeGroupFromAllUsers(group: string, confirm = false): void {
    this.mutateDatabase((db) => {
      const after = this.withoutGroup(db.users, group)
      this.assertEnabledCountGuard(db.users, after, false, confirm)
      db.users = after
    })
    this.logger.debug(`Group removed from every user: ${group}`)
  }

  /** Throws instead of resolving false when the database is unreadable — see {@link userExists}. */
  async verifyPassword(username: string, password: string): Promise<boolean> {
    const user = lookupUser(this.readDatabaseOrThrow().users, username)
    if (!user)
      return false

    return argon2.verify(user.password, password)
  }

  async resetPassword(username: string, newPassword: string) {
    this.findUserOrThrow(this.readDatabaseOrThrow(), username)

    const passwordHash = await argon2.hash(newPassword, this.argon2Options)

    // Looked up again rather than reused: the user may have been deleted while the hash ran.
    this.mutateDatabase((db) => {
      this.findUserOrThrow(db, username).password = passwordHash
    })
    this.logger.debug(`Password reset for: ${username}`)
  }

  deleteUser(username: string, confirm = false) {
    this.mutateDatabase((db) => {
      const user = this.findUserOrThrow(db, username)

      if (!user.disabled) {
        const resultingUsers = { ...db.users }
        delete resultingUsers[username]
        this.assertEnabledCountGuard(db.users, resultingUsers, true, confirm)
      }

      delete db.users[username]
    })

    this.db.instance
      .prepare('DELETE FROM reset_tokens WHERE username = ? AND used_at IS NULL')
      .run(username)

    this.logger.debug(`User deleted: ${username}`)
  }
}
