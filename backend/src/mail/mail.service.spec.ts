import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MailService } from './mail.service'

const nodemailerMock = vi.hoisted(() => {
  const sendMail = vi.fn()
  const createTransport = vi.fn((_options: unknown) => ({
    sendMail,
  }))
  return { sendMail, createTransport }
})

vi.mock('nodemailer', () => ({
  createTransport: (options: unknown) => nodemailerMock.createTransport(options),
}))

describe('mailService', () => {
  async function buildService(config: Record<string, unknown>) {
    const mockConfigService = {
      get: vi.fn((key: string, fallback?: unknown) => config[key] ?? fallback),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    return module.get<MailService>(MailService)
  }

  beforeEach(() => {
    nodemailerMock.sendMail.mockReset()
    nodemailerMock.createTransport.mockClear()
  })

  describe('when SMTP_HOST is not configured', () => {
    it('should return an error without throwing, for both invite and reset emails', async () => {
      const service = await buildService({})

      const inviteResult = await service.sendInviteEmail({
        to: 'a@test.com',
        displayname: 'Alice',
        token: 'tok-1',
        groups: ['users'],
        expiresAt: '2099-01-01T00:00:00.000Z',
      })
      const resetResult = await service.sendResetEmail({ to: 'b@test.com', displayname: 'Bob', token: 'tok-2' })

      expect(inviteResult).toEqual({
        error: expect.any(String),
      })
      expect(resetResult).toEqual({
        error: expect.any(String),
      })
      expect(nodemailerMock.sendMail).not.toHaveBeenCalled()
    })
  })

  describe('when SMTP_USERNAME is set without SMTP_PASSWORD', () => {
    it('should disable delivery instead of attempting auth with a missing password', async () => {
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', SMTP_USERNAME: 'user', PUBLIC_URL: 'https://tegata.example.com' })

      const result = await service.sendInviteEmail({
        to: 'a@test.com',
        displayname: null,
        token: 'tok-1',
        groups: ['users'],
        expiresAt: '2099-01-01T00:00:00.000Z',
      })

      expect(result).toEqual({
        error: expect.any(String),
      })
      expect(nodemailerMock.createTransport).not.toHaveBeenCalled()
      expect(nodemailerMock.sendMail).not.toHaveBeenCalled()
    })
  })

  describe('when SITE_NAME is configured', () => {
    const invite = {
      to: 'a@test.com',
      displayname: 'Alice',
      token: 'tok-1',
      groups: ['users'],
      expiresAt: '2099-01-01T00:00:00.000Z',
    }

    it('should name the site in the invite subject and body', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', SITE_NAME: 'Example Family SSO', PUBLIC_URL: 'https://tegata.example.com' })

      await service.sendInviteEmail(invite)

      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'You\'ve been invited to join Example Family SSO',
        text: expect.stringContaining('invited to join Example Family SSO.'),
      }))
    })

    it('should name the site in the reset subject and body', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', SITE_NAME: 'Example Family SSO', PUBLIC_URL: 'https://tegata.example.com' })

      await service.sendResetEmail({ to: 'b@test.com', displayname: 'Bob', token: 'tok-2' })

      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'Password reset for your Example Family SSO account',
        text: expect.stringContaining('for your Example Family SSO account.'),
      }))
    })

    it('should default to Tegata when unset', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', PUBLIC_URL: 'https://tegata.example.com' })

      await service.sendInviteEmail(invite)

      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'You\'ve been invited to join Tegata',
      }))
    })
  })

  describe('pUBLIC_URL resolution', () => {
    const smtp = { SMTP_HOST: 'smtp.example.com' }
    const reset = { to: 'b@test.com', displayname: null, token: 'tok-2' }

    it('should refuse to boot when SMTP_HOST is set without PUBLIC_URL or OIDC_REDIRECT_URI', async () => {
      await expect(buildService(smtp)).rejects.toThrow(/PUBLIC_URL.*OIDC_REDIRECT_URI/)
    })

    it('should derive the origin from OIDC_REDIRECT_URI when PUBLIC_URL is unset', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ ...smtp, OIDC_REDIRECT_URI: 'https://tegata.example.com/api/auth/oidc/callback' })

      await service.sendResetEmail(reset)

      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('https://tegata.example.com/reset/tok-2'),
      }))
    })

    it('should prefer PUBLIC_URL over OIDC_REDIRECT_URI and strip a trailing slash', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ ...smtp, PUBLIC_URL: 'https://a.example.com/', OIDC_REDIRECT_URI: 'https://b.example.com/cb' })

      await service.sendResetEmail(reset)

      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('https://a.example.com/reset/tok-2'),
      }))
    })

    it('should reject a PUBLIC_URL that is not an absolute http(s) URL', async () => {
      await expect(buildService({ ...smtp, PUBLIC_URL: 'tegata.example.com' })).rejects.toThrow(/PUBLIC_URL/)
      await expect(buildService({ ...smtp, PUBLIC_URL: 'ftp://tegata.example.com' })).rejects.toThrow(/PUBLIC_URL/)
    })

    it('should stay optional when SMTP_HOST is unset', async () => {
      await expect(buildService({})).resolves.toBeDefined()
    })
  })

  describe('when SMTP_HOST is configured', () => {
    it('should send the invite email and return sentAt on success', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', PUBLIC_URL: 'https://tegata.example.com' })

      const result = await service.sendInviteEmail({
        to: 'a@test.com',
        displayname: 'Alice',
        token: 'tok-1',
        groups: ['users', 'admins'],
        expiresAt: '2099-01-01T00:00:00.000Z',
      })

      expect(result).toEqual({
        sentAt: expect.any(String),
      })
      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'a@test.com',
        text: expect.stringContaining('https://tegata.example.com/register/tok-1'),
      }))
    })

    it('should include the granted groups and the expiry date in the invite email body', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', PUBLIC_URL: 'https://tegata.example.com' })

      await service.sendInviteEmail({
        to: 'a@test.com',
        displayname: null,
        token: 'tok-1',
        groups: ['users', 'admins'],
        expiresAt: '2099-01-01T00:00:00.000Z',
      })

      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('users, admins'),
      }))
      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining(new Date('2099-01-01T00:00:00.000Z').toUTCString()),
      }))
    })

    it('should send the reset email with the reset link', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', PUBLIC_URL: 'https://tegata.example.com' })

      const result = await service.sendResetEmail({ to: 'b@test.com', displayname: 'Bob', token: 'tok-2' })

      expect(result).toEqual({
        sentAt: expect.any(String),
      })
      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'b@test.com',
        text: expect.stringContaining('https://tegata.example.com/reset/tok-2'),
      }))
    })

    it('should fall back to a generic greeting when displayname is null', async () => {
      nodemailerMock.sendMail.mockResolvedValue(undefined)
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', PUBLIC_URL: 'https://tegata.example.com' })

      await service.sendResetEmail({ to: 'b@test.com', displayname: null, token: 'tok-2' })

      expect(nodemailerMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Hi,'),
      }))
      expect(nodemailerMock.sendMail).not.toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Hi ,'),
      }))
    })

    it('should return an error without throwing when the transporter rejects', async () => {
      nodemailerMock.sendMail.mockRejectedValue(new Error('connection refused'))
      const service = await buildService({ SMTP_HOST: 'smtp.example.com', PUBLIC_URL: 'https://tegata.example.com' })

      const result = await service.sendInviteEmail({
        to: 'a@test.com',
        displayname: null,
        token: 'tok-1',
        groups: ['users'],
        expiresAt: '2099-01-01T00:00:00.000Z',
      })

      expect(result).toEqual({ error: 'connection refused' })
    })

    it('should coerce SMTP_PORT to a number', async () => {
      await buildService({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', PUBLIC_URL: 'https://tegata.example.com' })

      expect(nodemailerMock.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465 }))
    })

    it('should omit auth when SMTP_USERNAME is not set', async () => {
      await buildService({ SMTP_HOST: 'smtp.example.com', PUBLIC_URL: 'https://tegata.example.com' })

      expect(nodemailerMock.createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }))
    })

    it('should include auth when SMTP_USERNAME is set', async () => {
      await buildService({
        SMTP_HOST: 'smtp.example.com',
        SMTP_USERNAME: 'user',
        SMTP_PASSWORD: 'pass',
        PUBLIC_URL: 'https://tegata.example.com',
      })

      expect(nodemailerMock.createTransport).toHaveBeenCalledWith(expect.objectContaining({
        auth: { user: 'user', pass: 'pass' },
      }))
    })
  })

  describe('transport security', () => {
    const base = { SMTP_HOST: 'smtp.example.com', PUBLIC_URL: 'https://tegata.example.com' }
    const creds = { SMTP_USERNAME: 'user', SMTP_PASSWORD: 'pass' }

    function transportOptions() {
      return nodemailerMock.createTransport.mock.calls[0][0] as Record<string, unknown>
    }

    it('should default to port 587 without implicit TLS', async () => {
      await buildService(base)

      expect(transportOptions()).toMatchObject({ port: 587, secure: false })
    })

    it('should use implicit TLS on port 465', async () => {
      await buildService({ ...base, SMTP_PORT: '465' })

      expect(transportOptions()).toMatchObject({ port: 465, secure: true })
    })

    it('should let SMTP_SECURE override the port-based default', async () => {
      await buildService({ ...base, SMTP_PORT: '465', SMTP_SECURE: 'false' })
      expect(transportOptions()).toMatchObject({ port: 465, secure: false })

      nodemailerMock.createTransport.mockClear()
      await buildService({ ...base, SMTP_PORT: '2465', SMTP_SECURE: 'true' })
      expect(transportOptions()).toMatchObject({ port: 2465, secure: true })
    })

    it('should require STARTTLS before sending credentials on a non-TLS port', async () => {
      await buildService({
        ...base,
        ...creds,
        SMTP_PORT: '587',
      })

      expect(transportOptions()).toMatchObject({ secure: false, requireTLS: true })
    })

    it('should not require STARTTLS when SMTP_REQUIRE_TLS=false', async () => {
      await buildService({
        ...base,
        ...creds,
        SMTP_PORT: '587',
        SMTP_REQUIRE_TLS: 'false',
      })

      expect(transportOptions()).toMatchObject({ secure: false, requireTLS: false })
    })

    it('should keep STARTTLS opportunistic for an unauthenticated relay', async () => {
      await buildService({ ...base, SMTP_PORT: '25' })

      expect(transportOptions()).toMatchObject({ secure: false, requireTLS: false })
    })

    it('should not ask for STARTTLS on an implicit-TLS connection', async () => {
      await buildService({
        ...base,
        ...creds,
        SMTP_PORT: '465',
      })

      expect(transportOptions()).toMatchObject({ secure: true, requireTLS: false })
    })

    it.each([
      'abc',
      '0',
      '65536',
      '58.7',
      '-1',
      '0x1d',
    ])('should refuse to boot on SMTP_PORT=%j', async (port) => {
      await expect(buildService({ ...base, SMTP_PORT: port })).rejects.toThrow(/SMTP_PORT/)
    })

    it.each(['SMTP_SECURE', 'SMTP_REQUIRE_TLS'])('should refuse to boot on a non-boolean %s', async (name) => {
      await expect(buildService({
        ...base,
        ...creds,
        [name]: 'yes',
      })).rejects.toThrow(new RegExp(name))
    })

    it('should refuse to boot on a non-boolean SMTP_REQUIRE_TLS even with implicit TLS', async () => {
      await expect(buildService({ ...base, SMTP_PORT: '465', SMTP_REQUIRE_TLS: 'yes' })).rejects.toThrow(/SMTP_REQUIRE_TLS/)
    })

    it('should treat a blank SMTP_PORT as unset', async () => {
      await buildService({ ...base, SMTP_PORT: '  ' })

      expect(transportOptions()).toMatchObject({ port: 587 })
    })

    it('should accept booleans case-insensitively with surrounding whitespace', async () => {
      await buildService({ ...base, SMTP_PORT: '2465', SMTP_SECURE: ' TRUE ' })

      expect(transportOptions()).toMatchObject({ secure: true })
    })
  })
})
