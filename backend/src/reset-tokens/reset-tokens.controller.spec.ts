import type { Mocked } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import { ResetTokensController } from './reset-tokens.controller'
import { ResetTokensService } from './reset-tokens.service'

describe('resetTokensController', () => {
  let controller: ResetTokensController
  let mockResetTokensService: Mocked<Pick<ResetTokensService, 'listResetTokens' | 'createResetToken' | 'revokeResetToken' | 'getByToken' | 'redeemResetToken' | 'sendResetTokenEmail'>>

  beforeEach(async () => {
    mockResetTokensService = {
      listResetTokens: vi.fn(),
      createResetToken: vi.fn(),
      revokeResetToken: vi.fn(),
      getByToken: vi.fn(),
      redeemResetToken: vi.fn(),
      sendResetTokenEmail: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResetTokensController],
      providers: [
        { provide: ResetTokensService, useValue: mockResetTokensService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get<ResetTokensController>(ResetTokensController)
  })

  describe('list', () => {
    it('should return all reset tokens', () => {
      const tokens = [
        {
          id: '1',
          token: 't1',
          username: 'alice',
          expires_at: '2099-01-01',
          used_at: null,
          created_at: '2024-01-01',
          email_sent_at: null,
          email_error: null,
        },
      ]
      mockResetTokensService.listResetTokens.mockReturnValue(tokens)

      expect(controller.list()).toEqual(tokens)
    })
  })

  describe('create', () => {
    it('should call createResetToken with username and expiry', async () => {
      const token = {
        id: '1',
        token: 't',
        username: 'alice',
        expires_at: '2099-01-01',
        used_at: null,
        created_at: '2024-01-01',
        email_sent_at: null,
        email_error: null,
      }
      mockResetTokensService.createResetToken.mockResolvedValue(token)

      const result = await controller.create({ username: 'alice', expiresInDays: 3 })

      expect(mockResetTokensService.createResetToken).toHaveBeenCalledWith('alice', 3, undefined)
      expect(result).toEqual(token)
    })

    it('should pass undefined for expiresInDays when not provided', async () => {
      mockResetTokensService.createResetToken.mockResolvedValue({} as any)

      await controller.create({ username: 'bob' })

      expect(mockResetTokensService.createResetToken).toHaveBeenCalledWith('bob', undefined, undefined)
    })

    it('should pass sendEmail through to createResetToken', async () => {
      mockResetTokensService.createResetToken.mockResolvedValue({} as any)

      await controller.create({ username: 'bob', sendEmail: true })

      expect(mockResetTokensService.createResetToken).toHaveBeenCalledWith('bob', undefined, true)
    })
  })

  describe('revoke', () => {
    it('should call revokeResetToken and return success', () => {
      const result = controller.revoke('rt-123')

      expect(mockResetTokensService.revokeResetToken).toHaveBeenCalledWith('rt-123')
      expect(result).toEqual({ success: true })
    })
  })

  describe('send', () => {
    it('should call sendResetTokenEmail and return the updated token', async () => {
      const token = {
        id: '1',
        token: 't',
        username: 'alice',
        expires_at: '2099-01-01',
        used_at: null,
        created_at: '2024-01-01',
        email_sent_at: '2024-06-01',
        email_error: null,
      }
      mockResetTokensService.sendResetTokenEmail.mockResolvedValue(token)

      const result = await controller.send('1')

      expect(mockResetTokensService.sendResetTokenEmail).toHaveBeenCalledWith('1')
      expect(result).toEqual(token)
    })
  })

  describe('validate', () => {
    it('should return valid false when token not found', () => {
      mockResetTokensService.getByToken.mockReturnValue(null)

      expect(controller.validate('bad-token')).toEqual({ valid: false })
    })

    it('should return valid false when token already used', () => {
      mockResetTokensService.getByToken.mockReturnValue({
        id: '1',
        token: 't',
        username: 'alice',
        expires_at: '2099-01-01',
        used_at: '2024-01-01',
        created_at: '2024-01-01',
        email_sent_at: null,
        email_error: null,
      })

      expect(controller.validate('t')).toEqual({ valid: false })
    })

    it('should return valid false when token expired', () => {
      mockResetTokensService.getByToken.mockReturnValue({
        id: '1',
        token: 't',
        username: 'alice',
        expires_at: '2020-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2020-01-01',
        email_sent_at: null,
        email_error: null,
      })

      expect(controller.validate('t')).toEqual({ valid: false })
    })

    it('should return valid true with username for active token', () => {
      mockResetTokensService.getByToken.mockReturnValue({
        id: '1',
        token: 't',
        username: 'alice',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
        created_at: '2024-01-01',
        email_sent_at: null,
        email_error: null,
      })

      expect(controller.validate('t')).toEqual({ valid: true, username: 'alice' })
    })
  })

  describe('redeem', () => {
    it('should call redeemResetToken with token and password', async () => {
      mockResetTokensService.redeemResetToken.mockResolvedValue({ username: 'alice' })

      const result = await controller.redeem('tok-123', { password: 'newpass99' })

      expect(mockResetTokensService.redeemResetToken).toHaveBeenCalledWith('tok-123', 'newpass99')
      expect(result).toEqual({ username: 'alice' })
    })
  })
})
