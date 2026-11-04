import type { AutheliaWriteStatus, HomepageStatus } from './status.types'
import { stat } from 'node:fs/promises'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InvitesService, isPendingInvite } from '../invites/invites.service'
import { UsersService } from '../users/users.service'

@Injectable()
export class StatusService {
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
    try {
      const s = await stat(this.autheliaUsersFile)
      return { ageHours: (Date.now() - s.mtimeMs) / 3_600_000, ok: true }
    }
    catch {
      return { ageHours: Infinity, ok: false }
    }
  }
}
