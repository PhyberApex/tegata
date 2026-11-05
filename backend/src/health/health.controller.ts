import { readFileSync } from 'node:fs'
import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as yaml from 'js-yaml'
import { DatabaseService } from '../database/database.service'

type UsersDatabaseHealth = { healthy: true } | { healthy: false, reason: string }

@Controller('health')
export class HealthController {
  private readonly usersFilePath: string

  constructor(
    private readonly dbService: DatabaseService,
    config: ConfigService,
  ) {
    this.usersFilePath = config.get<string>(
      'AUTHELIA_USERS_FILE',
      '/authelia-config/users_database.yml',
    )
  }

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
   * Reads and parses the users database independently of UsersService.readDatabase() — that method
   * runs Out-of-Band Edit detection (a DB write) and swallows both a missing file and a parse failure
   * into the same empty fallback, which loses the signal this check needs. A missing file is healthy
   * (UsersService tolerates a not-yet-created database, and CI boots against a fresh temp dir without
   * one); a file that exists but can't be read (e.g. permission denied) or fails to YAML-parse is
   * unhealthy — both are "unparsable" from the admin's point of view.
   */
  private checkUsersDatabase(): UsersDatabaseHealth {
    let content: string
    try {
      content = readFileSync(this.usersFilePath, 'utf-8')
    }
    catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT')
        return { healthy: true }

      const message = err instanceof Error
        ? err.message
        : String(err)
      return { healthy: false, reason: `Authelia users database could not be read: ${message}` }
    }

    try {
      yaml.loadAll(content)
      return { healthy: true }
    }
    catch (err) {
      const message = err instanceof Error
        ? err.message
        : String(err)
      return { healthy: false, reason: `Authelia users database is not valid YAML: ${message}` }
    }
  }
}
