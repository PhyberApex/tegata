import type { Mocked } from 'vitest'
import { NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileGuard, ProfileRequest } from '../auth/profile.guard'
import { UnverifiablePasswordHashException, UsersService } from '../users/users.service'
import { ProfileController, UpdateProfileDto } from './profile.controller'

describe('profileController', () => {
  let controller: ProfileController
  let mockUsersService: Mocked<Pick<UsersService, 'lookupAccount' | 'updateUser' | 'verifyPassword' | 'resetPassword'>>

  beforeEach(async () => {
    mockUsersService = {
      lookupAccount: vi.fn(),
      updateUser: vi.fn(),
      verifyPassword: vi.fn(),
      resetPassword: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    })
      .overrideGuard(ProfileGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get<ProfileController>(ProfileController)
  })

  function requestFor(username: string): ProfileRequest {
    return { username } as ProfileRequest
  }

  describe('get', () => {
    it('should return the session user\'s username, displayname and email, and not their groups', () => {
      mockUsersService.lookupAccount.mockReturnValue({
        readable: true,
        user: {
          username: 'alice',
          displayname: 'Alice A',
          email: 'alice@example.com',
          groups: ['admins'],
          disabled: false,
        },
      })

      expect(controller.get(requestFor('alice'))).toEqual({
        username: 'alice',
        displayname: 'Alice A',
        email: 'alice@example.com',
      })
      expect(mockUsersService.lookupAccount).toHaveBeenCalledWith('alice')
    })

    it('should answer 404 when the user vanished between the guard and the read', () => {
      mockUsersService.lookupAccount.mockReturnValue({ readable: true, user: null })

      expect(() => controller.get(requestFor('alice'))).toThrow(NotFoundException)
    })

    it('should answer 503, not 404, when the users database turned Unreadable after the guard\'s read', () => {
      mockUsersService.lookupAccount.mockReturnValue({ readable: false })

      expect(() => controller.get(requestFor('alice'))).toThrow(ServiceUnavailableException)
    })
  })

  describe('update', () => {
    it('should call updateUser with the session username and return username, displayname and email, not groups or disabled', () => {
      mockUsersService.updateUser.mockReturnValue({
        username: 'alice',
        displayname: 'Alice A',
        email: 'alice@example.com',
        groups: ['users'],
        disabled: false,
      })

      const result = controller.update(requestFor('alice'), { displayname: 'Alice A', email: 'alice@example.com' })

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('alice', { displayname: 'Alice A', email: 'alice@example.com' })
      expect(result).toStrictEqual({ username: 'alice', displayname: 'Alice A', email: 'alice@example.com' })
    })

    it('should not pass a DTO\'s extra groups or disabled property on to updateUser', () => {
      mockUsersService.updateUser.mockReturnValue({} as any)
      const dto = Object.assign(new UpdateProfileDto(), {
        email: 'alice@example.com',
        groups: ['tegata'],
        disabled: false,
      })

      controller.update(requestFor('alice'), dto)

      expect(mockUsersService.updateUser.mock.calls).toStrictEqual([
        [
          'alice',
          { displayname: undefined, email: 'alice@example.com' },
        ],
      ])
    })

    it('should ignore an attacker-supplied username and use the session one', () => {
      mockUsersService.updateUser.mockReturnValue({} as any)

      controller.update(requestFor('bob'), { displayname: 'Someone Else' })

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('bob', { displayname: 'Someone Else' })
    })
  })

  describe('changePassword', () => {
    it('should call resetPassword after verifyPassword succeeds', async () => {
      mockUsersService.verifyPassword.mockResolvedValue(true)
      mockUsersService.resetPassword.mockResolvedValue(undefined)

      const result = await controller.changePassword(requestFor('alice'), { currentPassword: 'old-pass', newPassword: 'new-password' })

      expect(mockUsersService.verifyPassword).toHaveBeenCalledWith('alice', 'old-pass')
      expect(mockUsersService.resetPassword).toHaveBeenCalledWith('alice', 'new-password')
      expect(result).toEqual({ success: true })
    })

    it('should throw and never call resetPassword when verifyPassword fails', async () => {
      mockUsersService.verifyPassword.mockResolvedValue(false)

      await expect(
        controller.changePassword(requestFor('alice'), { currentPassword: 'wrong', newPassword: 'new-password' }),
      ).rejects.toThrow(UnauthorizedException)

      expect(mockUsersService.resetPassword).not.toHaveBeenCalled()
    })

    it('should propagate ServiceUnavailableException from verifyPassword instead of a misleading "incorrect password"', async () => {
      mockUsersService.verifyPassword.mockRejectedValue(
        new ServiceUnavailableException('The users database file could not be parsed: bad indentation'),
      )

      await expect(
        controller.changePassword(requestFor('alice'), { currentPassword: 'old-pass', newPassword: 'new-password' }),
      ).rejects.toThrow(ServiceUnavailableException)

      expect(mockUsersService.resetPassword).not.toHaveBeenCalled()
    })

    it('should propagate UnverifiablePasswordHashException instead of "Current password is incorrect"', async () => {
      mockUsersService.verifyPassword.mockRejectedValue(new UnverifiablePasswordHashException())

      const change = controller.changePassword(requestFor('alice'), { currentPassword: 'old-pass', newPassword: 'new-password' })

      await expect(change).rejects.toThrow(UnverifiablePasswordHashException)
      await expect(change).rejects.not.toThrow('Current password is incorrect')
      expect(mockUsersService.resetPassword).not.toHaveBeenCalled()
    })
  })
})
