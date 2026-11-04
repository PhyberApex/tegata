import type { Mocked } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import { InvitesController } from './invites.controller'
import { InvitesService } from './invites.service'

describe('invitesController', () => {
  let controller: InvitesController
  let mockInvitesService: Mocked<Pick<InvitesService, 'listInvites' | 'createInvite' | 'revokeInvite' | 'getByToken' | 'redeemInvite' | 'sendInviteEmail'>>

  beforeEach(async () => {
    mockInvitesService = {
      listInvites: vi.fn(),
      createInvite: vi.fn(),
      revokeInvite: vi.fn(),
      getByToken: vi.fn(),
      redeemInvite: vi.fn(),
      sendInviteEmail: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitesController],
      providers: [
        { provide: InvitesService, useValue: mockInvitesService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get<InvitesController>(InvitesController)
  })

  describe('list', () => {
    it('should return all invites', () => {
      const invites = [
        {
          id: '1',
          token: 't1',
          groups: ['users'],
          expires_at: '2099-01-01',
          email: null,
          displayname: null,
          used_by: null,
          used_at: null,
          created_at: '2024-01-01',
          bundle_name: null,
          email_sent_at: null,
          email_error: null,
        },
      ]
      mockInvitesService.listInvites.mockReturnValue(invites)

      expect(controller.list()).toEqual(invites)
    })
  })

  describe('create', () => {
    it('should call createInvite with groups and expiry', async () => {
      const invite = {
        id: '1',
        token: 't',
        groups: ['users'],
        expires_at: '2099-01-01',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
        bundle_name: null,
        email_sent_at: null,
        email_error: null,
      }
      mockInvitesService.createInvite.mockResolvedValue(invite)

      const result = await controller.create({
        groups: ['users'],
        expiresInDays: 14,
      })

      expect(mockInvitesService.createInvite).toHaveBeenCalledWith(['users'], 14, { email: undefined, displayname: undefined }, undefined, undefined)
      expect(result).toEqual(invite)
    })

    it('should pass undefined for expiresInDays when not provided', async () => {
      mockInvitesService.createInvite.mockResolvedValue({} as any)

      await controller.create({
        groups: ['admins'],
      })

      expect(mockInvitesService.createInvite).toHaveBeenCalledWith(['admins'], undefined, { email: undefined, displayname: undefined }, undefined, undefined)
    })

    it('should pass email and displayname prefill to createInvite', async () => {
      mockInvitesService.createInvite.mockResolvedValue({} as any)

      await controller.create({
        groups: ['users'],
        email: 'alice@test.com',
        displayname: 'Alice',
      })

      expect(mockInvitesService.createInvite).toHaveBeenCalledWith(['users'], undefined, { email: 'alice@test.com', displayname: 'Alice' }, undefined, undefined)
    })

    it('should pass bundleName to createInvite when provided', async () => {
      mockInvitesService.createInvite.mockResolvedValue({} as any)

      await controller.create({
        groups: ['users', 'media'],
        bundleName: 'family',
      })

      expect(mockInvitesService.createInvite).toHaveBeenCalledWith(['users', 'media'], undefined, { email: undefined, displayname: undefined }, 'family', undefined)
    })

    it('should pass sendEmail through to createInvite', async () => {
      mockInvitesService.createInvite.mockResolvedValue({} as any)

      await controller.create({
        groups: ['users'],
        email: 'alice@test.com',
        sendEmail: true,
      })

      expect(mockInvitesService.createInvite).toHaveBeenCalledWith(['users'], undefined, { email: 'alice@test.com', displayname: undefined }, undefined, true)
    })
  })

  describe('send', () => {
    it('should call sendInviteEmail and return the updated invite', async () => {
      const invite = {
        id: '1',
        token: 't',
        groups: ['users'],
        expires_at: '2099-01-01',
        email: 'a@t.com',
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
        bundle_name: null,
        email_sent_at: '2024-06-01',
        email_error: null,
      }
      mockInvitesService.sendInviteEmail.mockResolvedValue(invite)

      const result = await controller.send('1')

      expect(mockInvitesService.sendInviteEmail).toHaveBeenCalledWith('1')
      expect(result).toEqual(invite)
    })
  })

  describe('revoke', () => {
    it('should call revokeInvite and return success', () => {
      const result = controller.revoke('inv-123')

      expect(mockInvitesService.revokeInvite).toHaveBeenCalledWith('inv-123')
      expect(result).toEqual({ success: true })
    })
  })

  describe('validate', () => {
    it('should return valid false when invite not found', () => {
      mockInvitesService.getByToken.mockReturnValue(null)

      expect(controller.validate('bad-token')).toEqual({ valid: false })
    })

    it('should return valid false when invite already used', () => {
      mockInvitesService.getByToken.mockReturnValue({
        id: '1',
        token: 't',
        groups: ['users'],
        expires_at: '2099-01-01',
        email: null,
        displayname: null,
        used_by: 'alice',
        used_at: '2024-01-01',
        created_at: '2024-01-01',
        bundle_name: null,
        email_sent_at: null,
        email_error: null,
      })

      expect(controller.validate('t')).toEqual({ valid: false })
    })

    it('should return valid false when invite expired', () => {
      mockInvitesService.getByToken.mockReturnValue({
        id: '1',
        token: 't',
        groups: ['users'],
        expires_at: '2020-01-01T00:00:00.000Z',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2020-01-01',
        bundle_name: null,
        email_sent_at: null,
        email_error: null,
      })

      expect(controller.validate('t')).toEqual({ valid: false })
    })

    it('should return valid true with groups for active invite', () => {
      mockInvitesService.getByToken.mockReturnValue({
        id: '1',
        token: 't',
        groups: ['users', 'admins'],
        expires_at: '2099-01-01T00:00:00.000Z',
        email: null,
        displayname: null,
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
        bundle_name: null,
        email_sent_at: null,
        email_error: null,
      })

      expect(controller.validate('t')).toEqual({
        valid: true,
        groups: ['users', 'admins'],
      })
    })

    it('should surface email and displayname when the invite fixed them', () => {
      mockInvitesService.getByToken.mockReturnValue({
        id: '1',
        token: 't',
        groups: ['users'],
        expires_at: '2099-01-01T00:00:00.000Z',
        email: 'alice@test.com',
        displayname: 'Alice',
        used_by: null,
        used_at: null,
        created_at: '2024-01-01',
        bundle_name: null,
        email_sent_at: null,
        email_error: null,
      })

      expect(controller.validate('t')).toEqual({
        valid: true,
        groups: ['users'],
        email: 'alice@test.com',
        displayname: 'Alice',
      })
    })
  })

  describe('redeem', () => {
    it('should call redeemInvite with all parameters', async () => {
      const user = {
        username: 'new',
        displayname: 'New',
        email: 'n@t.com',
        groups: ['users'],
      }
      mockInvitesService.redeemInvite.mockResolvedValue(user)

      const result = await controller.redeem('tok-123', {
        username: 'new',
        displayname: 'New',
        email: 'n@t.com',
        password: 'pass1234',
      })

      expect(mockInvitesService.redeemInvite).toHaveBeenCalledWith('tok-123', 'new', 'New', 'n@t.com', 'pass1234')
      expect(result).toEqual(user)
    })
  })
})
