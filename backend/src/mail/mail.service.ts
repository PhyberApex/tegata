import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

export type MailResult = { sentAt: string } | { error: string }

interface InviteEmailInput {
  to: string
  displayname: string | null
  token: string
  groups: string[]
  expiresAt: string
}

interface ResetEmailInput {
  to: string
  displayname: string | null
  token: string
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly transporter: nodemailer.Transporter | null
  private readonly sender: string
  private readonly publicUrl: string
  private readonly siteName: string

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST')
    this.sender = this.config.get<string>('SMTP_SENDER', 'Tegata <noreply@example.com>')
    this.siteName = this.config.get<string>('SITE_NAME', 'Tegata') || 'Tegata'
    this.publicUrl = this.resolvePublicUrl(host)

    if (!host) {
      this.logger.warn('SMTP_HOST not set — email delivery is disabled')
      this.transporter = null
      return
    }

    const username = this.config.get<string>('SMTP_USERNAME')
    const password = this.config.get<string>('SMTP_PASSWORD')

    if (username && !password) {
      this.logger.warn('SMTP_USERNAME set without SMTP_PASSWORD — email delivery is disabled')
      this.transporter = null
      return
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT', '587')),
      auth: username
        ? { user: username, pass: password }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    })
  }

  private resolvePublicUrl(smtpHost: string | undefined): string {
    const explicit = this.config.get<string>('PUBLIC_URL')
    if (explicit)
      return this.parseHttpOrigin('PUBLIC_URL', explicit, true)

    if (!smtpHost)
      return ''

    const redirectUri = this.config.get<string>('OIDC_REDIRECT_URI')
    if (!redirectUri) {
      throw new Error('SMTP_HOST is set but PUBLIC_URL is not. Set PUBLIC_URL (e.g. https://tegata.example.com) or OIDC_REDIRECT_URI so email links can be built.')
    }
    return this.parseHttpOrigin('OIDC_REDIRECT_URI', redirectUri, false)
  }

  private parseHttpOrigin(name: string, value: string, keepPath: boolean): string {
    let url: URL
    try {
      url = new URL(value)
    }
    catch {
      throw new Error(`${name} must be an absolute http(s) URL, got "${value}"`)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error(`${name} must be an absolute http(s) URL, got "${value}"`)
    return keepPath
      ? value.replace(/\/$/, '')
      : url.origin
  }

  async sendInviteEmail(input: InviteEmailInput): Promise<MailResult> {
    const greeting = input.displayname
      ? `Hi ${input.displayname},`
      : 'Hi,'
    const url = `${this.publicUrl}/register/${input.token}`
    const expiry = new Date(input.expiresAt).toUTCString()
    const groups = input.groups.join(', ')

    return this.deliver(
      input.to,
      `You've been invited to join ${this.siteName}`,
      `${greeting}\n\nYou've been invited to join ${this.siteName}. Use the link below to set up your account:\n\n${url}\n\nThis link grants membership in: ${groups}\nIt expires on ${expiry}.`,
    )
  }

  async sendResetEmail(input: ResetEmailInput): Promise<MailResult> {
    const greeting = input.displayname
      ? `Hi ${input.displayname},`
      : 'Hi,'
    const url = `${this.publicUrl}/reset/${input.token}`

    return this.deliver(
      input.to,
      `Password reset for your ${this.siteName} account`,
      `${greeting}\n\nA password reset was requested for your ${this.siteName} account. Use the link below to set a new password:\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
    )
  }

  private async deliver(to: string, subject: string, text: string): Promise<MailResult> {
    if (!this.transporter)
      return { error: 'SMTP is not configured' }

    try {
      await this.transporter.sendMail({ from: this.sender, to, subject, text })
      const sentAt = new Date().toISOString()
      this.logger.log(`Email sent to ${to}: ${subject}`)
      return { sentAt }
    }
    catch (err) {
      const error = err instanceof Error
        ? err.message
        : String(err)
      this.logger.warn(`Failed to send email to ${to}: ${error}`)
      return { error }
    }
  }
}
