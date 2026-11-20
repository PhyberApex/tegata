import type { UnreadableKind } from '../users/users.service'
import { Controller, Get, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { UsersService } from '../users/users.service'

type UsersDatabaseHealth = { healthy: true } | { healthy: false, reason: string }

/**
 * Fixed, content-free reasons for the unauthenticated health body. The underlying detail can carry the
 * file path or — for a YAML parse error — a snippet of the file's own lines (usernames, emails, hashes),
 * so it is only ever logged, never returned.
 */
const UNREADABLE_REASONS: Record<UnreadableKind, string> = {
  'read-error': 'Authelia users database could not be read',
  'missing': 'Authelia users database is missing',
  'invalid-yaml': 'Authelia users database is not valid YAML',
  'no-users-mapping': 'Authelia users database has no users mapping',
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  constructor(
    private readonly dbService: DatabaseService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  check() {
    const databaseOpen = this.dbService.instance.open
    const usersDatabase = this.checkUsersDatabase()

    if (databaseOpen && usersDatabase.healthy)
      return { status: 'ok', database: true, usersDatabase: true }

    const reasons: string[] = []
    if (!databaseOpen)
      reasons.push('SQLite database connection is closed')
    if (!usersDatabase.healthy)
      reasons.push(usersDatabase.reason)

    throw new HttpException(
      {
        status: 'unhealthy',
        database: databaseOpen,
        usersDatabase: usersDatabase.healthy,
        reasons,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    )
  }

  /**
   * Healthy exactly when UsersService would accept a write: delegates to `UsersService.getReadability()`,
   * the Unreadable Users Database rule (CONTEXT.md) without Out-of-Band Edit bookkeeping. A missing file
   * with no Baseline Hash recorded is healthy (fresh install, and the CI boot check); a read error, a
   * parse failure, a file without a `users` mapping (zero bytes included), or a missing file after a
   * Baseline Hash was recorded is unhealthy. The detail is logged at warn level and the caller gets only
   * a fixed reason per category. If the check itself throws (the baseline lookup needs SQLite, which may
   * be closed), the database counts as unhealthy rather than the probe failing with a 500.
   */
  private checkUsersDatabase(): UsersDatabaseHealth {
    try {
      const readability = this.usersService.getReadability()
      if (readability.readable)
        return { healthy: true }

      this.logger.warn(`Health check: users database is unreadable: ${readability.reason}`)
      return { healthy: false, reason: UNREADABLE_REASONS[readability.kind] }
    }
    catch (err) {
      this.logger.warn(`Health check: users database readability could not be checked: ${err}`)
      return { healthy: false, reason: 'Authelia users database could not be checked' }
    }
  }
}
