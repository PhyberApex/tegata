import type { AutheliaWriteStatus, HomepageStatus } from './status.types'
import { stat } from 'node:fs/promises'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InvitesService, isPendingInvite } from '../invites/invites.service'
import { UsersService } from '../users/users.service'

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name)
  private readonly autheliaUsersFile: string

  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly invites: InvitesService,
  ) {
    this.autheliaUsersFile = config.get('AUTHELIA_USERS_FILE', '/authelia-config/users_database.yml')
  }

  async getStatus(): Promise<HomepageStatus> {
    const authelia = await this.readAutheliaWriteStatus()

    return {
      totalUsers: this.users.listUsers().length,
      pendingInvites: this.countPendingInvites(),
      authelia,
    }
  }

  private countPendingInvites(): number {
    return this.invites.listInvites().filter(isPendingInvite).length
  }

  private async readAutheliaWriteStatus(): Promise<AutheliaWriteStatus> {
    let ageHours: number
    try {
      const s = await stat(this.autheliaUsersFile)
      ageHours = (Date.now() - s.mtimeMs) / 3_600_000
    }
    catch {
      return { ageHours: null, ok: false }
    }
    return {
      ageHours,
      ok: this.isUsersDatabaseReadable(),
    }
  }

  /**
   * Delegates to `UsersService.getReadability()`, the Unreadable Users Database rule `/api/health` uses,
   * so the widget cannot show a healthy, empty install while every write is being refused.
   */
  private isUsersDatabaseReadable(): boolean {
    try {
      return this.users.getReadability().readable
    }
    catch (err) {
      this.logger.warn(`Status: users database readability could not be checked: ${err}`)
      return false
    }
  }
}
