import { randomUUID } from 'node:crypto'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { MailService } from '../mail/mail.service'
import { recordEmailResult } from '../mail/record-email-result'
import { UsersService } from '../users/users.service'

const NO_EMAIL_ERROR = 'User has no email address to send to'

export interface ResetToken {
  id: string
  token: string
  username: string
  expires_at: string
  used_at: string | null
  created_at: string
  email_sent_at: string | null
  email_error: string | null
}

@Injectable()
export class ResetTokensService {
  private readonly logger = new Logger(ResetTokensService.name)

  constructor(
    private db: DatabaseService,
    private usersService: UsersService,
    private mailService: MailService,
  ) {}

  async createResetToken(username: string, expiresInDays = 1, sendEmail = false): Promise<ResetToken> {
    if (!this.usersService.userExists(username))
      throw new NotFoundException(`User "${username}" not found`)

    const id = randomUUID()
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

    this.db.instance
      .prepare('DELETE FROM reset_tokens WHERE username = ? AND used_at IS NULL')
      .run(username)

    this.db.instance
      .prepare('INSERT INTO reset_tokens (id, token, username, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, token, username, expiresAt, new Date().toISOString())

    this.logger.log(`Reset token created: ${id} (user: ${username}, expires: ${expiresAt})`)

    if (sendEmail) {
      const user = this.usersService.getUser(username)
      if (user?.email) {
        // Fire-and-forget: a slow or unreachable relay must never stall the create response.
        this.mailService.sendResetEmail({ to: user.email, displayname: user.displayname, token })
          .then(result => recordEmailResult(this.db.instance, 'reset_tokens', id, result))
          .catch(err => this.logger.error(`Failed to record reset token email result for ${id}: ${err}`))
      }
      else {
        // Recorded rather than thrown: the token is created either way, and the row must show the send didn't happen.
        recordEmailResult(this.db.instance, 'reset_tokens', id, { error: NO_EMAIL_ERROR })
      }
    }

    return this.getById(id)!
  }

  /** Same operation for a first send and a resend — there is no separate resend-only path. */
  async sendResetTokenEmail(id: string): Promise<ResetToken> {
    const resetToken = this.assertRedeemable(this.getById(id))

    // Resolved live, not a snapshot from creation time — the user's email may have changed since.
    const user = this.usersService.getUser(resetToken.username)
    if (!user?.email)
      throw new BadRequestException(NO_EMAIL_ERROR)

    const result = await this.mailService.sendResetEmail({
      to: user.email,
      displayname: user.displayname,
      token: resetToken.token,
    })
    recordEmailResult(this.db.instance, 'reset_tokens', id, result)

    const updated = this.getById(id)
    if (!updated)
      throw new NotFoundException('Reset token not found')

    return updated
  }

  /** A token found, unused and unexpired — what both sending and redeeming require. */
  private assertRedeemable(resetToken: ResetToken | null): ResetToken {
    if (!resetToken)
      throw new NotFoundException('Reset token not found')

    if (resetToken.used_at)
      throw new BadRequestException('Reset token has already been used')

    if (new Date(resetToken.expires_at) < new Date())
      throw new BadRequestException('Reset token has expired')

    return resetToken
  }

  listResetTokens(): ResetToken[] {
    const rows = this.db.instance
      .prepare('SELECT * FROM reset_tokens ORDER BY created_at DESC')
      .all() as ResetToken[]

    this.logger.debug(`Listed ${rows.length} reset tokens`)
    return rows
  }

  getByToken(token: string): ResetToken | null {
    const row = this.db.instance
      .prepare('SELECT * FROM reset_tokens WHERE token = ?')
      .get(token) as ResetToken | undefined

    if (!row)
      this.logger.debug(`Reset token not found by token`)

    return row ?? null
  }

  getById(id: string): ResetToken | null {
    const row = this.db.instance
      .prepare('SELECT * FROM reset_tokens WHERE id = ?')
      .get(id) as ResetToken | undefined

    if (!row)
      this.logger.debug(`Reset token not found by id: ${id}`)

    return row ?? null
  }

  async redeemResetToken(token: string, password: string) {
    const resetToken = this.assertRedeemable(this.getByToken(token))

    if (!this.usersService.userExists(resetToken.username))
      throw new BadRequestException('User no longer exists')

    // Claimed before the password write, and only if still unclaimed — the same race and release as
    // InvitesService.redeemInvite.
    const claim = this.db.instance
      .prepare('UPDATE reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
      .run(new Date().toISOString(), resetToken.id)
    if (claim.changes === 0)
      throw new BadRequestException('Reset token has already been used')

    try {
      await this.usersService.resetPassword(resetToken.username, password)
    }
    catch (err) {
      this.releaseClaim(resetToken, err)
      throw err
    }

    this.logger.log(`Reset token ${resetToken.id} redeemed by ${resetToken.username}`)

    return { username: resetToken.username }
  }

  /**
   * Makes a claimed token redeemable again after its password write failed — unless deleteUser or
   * createResetToken ran meanwhile, which both spare a claimed row only because it looked used. Reviving
   * it then would leave a live token for a deleted user (one a re-created username could redeem) or a
   * second live token beside the newer one, so it's deleted instead.
   */
  private releaseClaim(resetToken: ResetToken, err: unknown): void {
    const released = !(err instanceof NotFoundException) && this.db.instance
      .prepare(`
        UPDATE reset_tokens SET used_at = NULL
        WHERE id = ? AND NOT EXISTS (
          SELECT 1 FROM reset_tokens WHERE username = ? AND used_at IS NULL AND id != ?
        )
      `)
      .run(resetToken.id, resetToken.username, resetToken.id)
      .changes > 0
    if (!released) {
      this.db.instance
        .prepare('DELETE FROM reset_tokens WHERE id = ?')
        .run(resetToken.id)
    }
  }

  revokeResetToken(id: string) {
    const resetToken = this.getById(id)

    if (!resetToken)
      throw new NotFoundException('Reset token not found')

    this.db.instance
      .prepare('DELETE FROM reset_tokens WHERE id = ?')
      .run(id)

    this.logger.log(`Reset token ${id} revoked`)
  }
}
