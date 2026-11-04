import type { Invite } from '@tegata/shared'
import { randomUUID } from 'node:crypto'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from '../groups/groups.service'
import { MailService } from '../mail/mail.service'
import { recordEmailResult } from '../mail/record-email-result'
import { UsersService } from '../users/users.service'
import { isPendingInvite } from './pending-invite'

export { isPendingInvite } from './pending-invite'

export interface InvitePrefill {
  email?: string
  displayname?: string
}

export type { Invite } from '@tegata/shared'

// The row as SQLite stores it: `groups` is the JSON-encoded array.
type InviteRow = Omit<Invite, 'groups'> & { groups: string }

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name)

  constructor(
    private db: DatabaseService,
    private usersService: UsersService,
    private groupsService: GroupsService,
    private mailService: MailService,
  ) {}

  private rowToInvite(row: InviteRow): Invite {
    return {
      ...row,
      groups: JSON.parse(row.groups),
    }
  }

  async createInvite(groups: string[], expiresInDays = 7, prefill: InvitePrefill = {}, bundleName?: string | null, sendEmail = false): Promise<Invite> {
    const id = randomUUID()
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

    for (const group of groups)
      this.groupsService.ensureGroup(group)

    this.db.instance
      .prepare('INSERT INTO invites (id, token, groups, expires_at, email, displayname, bundle_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, token, JSON.stringify(groups), expiresAt, prefill.email ?? null, prefill.displayname ?? null, bundleName ?? null, new Date().toISOString())

    this.logger.log(`Invite created: ${id} (groups: ${groups.join(', ')}, expires: ${expiresAt})`)

    if (sendEmail && prefill.email) {
      // Fire-and-forget: a slow or unreachable relay must never stall the create response.
      this.mailService.sendInviteEmail({
        to: prefill.email,
        displayname: prefill.displayname ?? null,
        token,
        groups,
        expiresAt,
      }).then(result => recordEmailResult(this.db.instance, 'invites', id, result)).catch(err => this.logger.error(`Failed to record invite email result for ${id}: ${err}`))
    }

    return this.getById(id)!
  }

  /** Same operation for a first send and a resend — there is no separate resend-only path. */
  async sendInviteEmail(id: string): Promise<Invite> {
    const invite = this.getById(id)

    if (!invite)
      throw new NotFoundException('Invite not found')

    if (!invite.email)
      throw new BadRequestException('Invite has no email address to send to')

    if (!isPendingInvite(invite))
      throw new BadRequestException('Invite is no longer pending')

    const result = await this.mailService.sendInviteEmail({
      to: invite.email,
      displayname: invite.displayname,
      token: invite.token,
      groups: invite.groups,
      expiresAt: invite.expires_at,
    })
    recordEmailResult(this.db.instance, 'invites', id, result)

    const updated = this.getById(id)
    if (!updated)
      throw new NotFoundException('Invite not found')

    return updated
  }

  listInvites(): Invite[] {
    const rows = this.db.instance
      .prepare('SELECT * FROM invites ORDER BY created_at DESC')
      .all() as InviteRow[]

    this.logger.debug(`Listed ${rows.length} invites`)
    return rows.map(row => this.rowToInvite(row))
  }

  getByToken(token: string): Invite | null {
    const row = this.db.instance
      .prepare('SELECT * FROM invites WHERE token = ?')
      .get(token) as InviteRow | undefined

    if (!row)
      this.logger.debug(`Invite not found by token`)

    return row
      ? this.rowToInvite(row)
      : null
  }

  getById(id: string): Invite | null {
    const row = this.db.instance
      .prepare('SELECT * FROM invites WHERE id = ?')
      .get(id) as InviteRow | undefined

    if (!row)
      this.logger.debug(`Invite not found by id: ${id}`)

    return row
      ? this.rowToInvite(row)
      : null
  }

  async redeemInvite(
    token: string,
    username: string,
    displayname: string,
    email: string,
    password: string,
  ) {
    const invite = this.getByToken(token)

    if (!invite)
      throw new NotFoundException('Invite not found')

    if (invite.used_by)
      throw new BadRequestException('Invite has already been used')

    if (new Date(invite.expires_at) < new Date())
      throw new BadRequestException('Invite has expired')

    // Claimed before the user write, and only if still unclaimed: two redemptions of one token both pass the
    // check above, and only the row update can tell them apart. A failed create releases the claim, so a 409
    // on a taken username leaves the invite redeemable.
    const claim = this.db.instance
      .prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL')
      .run(username, new Date().toISOString(), invite.id)
    if (claim.changes === 0)
      throw new BadRequestException('Invite has already been used')

    try {
      const user = await this.usersService.createUser(
        username,
        invite.displayname ?? displayname,
        invite.email ?? email,
        password,
        invite.groups,
      )
      this.logger.log(`Invite ${invite.id} redeemed by ${username}`)
      return user
    }
    catch (err) {
      this.db.instance
        .prepare('UPDATE invites SET used_by = NULL, used_at = NULL WHERE id = ? AND used_by = ?')
        .run(invite.id, username)
      throw err
    }
  }

  revokeInvite(id: string) {
    const invite = this.getById(id)

    if (!invite)
      throw new NotFoundException('Invite not found')

    this.db.instance
      .prepare('DELETE FROM invites WHERE id = ?')
      .run(id)

    this.logger.log(`Invite ${id} revoked`)
  }
}
